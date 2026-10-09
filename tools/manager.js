import { WorldStore } from './worlds.js';
import { control, consoleCommand } from './manager-control.js';
import { publicUrl } from './tunnel.js';
import {
  setupCloudflareApi,
  setupCloudflareBrowser,
  cloudflareLogin,
  setupReverseProxy,
  ensureTunnelTool,
} from './hosting.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
const worlds = new WorldStore();
async function status() {
  try {
    return await control({ action: 'status' });
  } catch (error) {
    if (['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(error.code))
      return { stopped: true, clients: [] };
    throw error;
  }
}
async function start(profile) {
  if (!(await status()).stopped)
    throw new Error(
      'A managed host is already running; stop it or launch another client',
    );
  await worlds.assertStopped();
  if (
    ![
      'server',
      'studio',
      'minecraft',
      'both',
      'quick',
      'named',
      'public',
    ].includes(profile)
  )
    throw new Error(
      'Profiles: server, studio, minecraft, both, quick, named, public',
    );
  if (['quick', 'named'].includes(profile))
    execFileSync(process.execPath, ['tools/install-tunnel.js'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  await mkdir('.local/logs', { recursive: true });
  const log = await open('.local/logs/manager.log', 'a');
  let child;
  let spawned;
  try {
    child = spawn(process.execPath, ['tools/manager-host.js', profile], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log.fd, log.fd],
    });
    spawned = new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } finally {
    await log.close();
  }
  await spawned;
  child.unref();
  for (let i = 0; i < 240; i++) {
    const result = await status();
    if (result.ready) return result;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        'Host startup failed. See .local/logs/host-console.log and .local/logs/minecraft.log',
      );
    if (i % 30 === 0) console.log('Starting services…');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    'Host did not reach READY in 120 seconds. Inspect status and logs.',
  );
}
async function secretFile() {
  const config = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(config.token))
    throw new Error('Launch a host first');
  await mkdir('.local/deployment', { recursive: true });
  const file = path.resolve('.local/deployment/roblox-secret.txt');
  await writeFile(file, config.token, { mode: 0o600 });
  return file;
}
async function consoleSession(rl) {
  console.log(
    'Minecraft console. Enter normal commands (say hi, op username). /logs shows replies; /back returns to the menu.',
  );
  while (true) {
    const line = await rl.question('server> ');
    if (line === '/back') break;
    if (line === '/logs') {
      console.log((await status()).console?.join('\n') ?? 'Host is stopped');
      continue;
    }
    if (!line.trim()) continue;
    await control({ action: 'console', command: consoleCommand(line) });
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log(
      (await status()).console?.slice(-6).join('\n') ?? 'Host stopped',
    );
    if (line === 'stop') break;
  }
}
async function hostingMenu(rl) {
  console.log(
    'Hosting: 1 Free temporary link  2 Cloudflare API token  3 Cloudflare browser sign-in\n4 Existing Cloudflare connector token  5 HTTPS reverse proxy / port forwarding',
  );
  const choice = await rl.question('Choose hosting: ');
  if (choice === '1') {
    console.log(await start('quick'));
    return;
  }
  const url = await rl.question(
    'Public HTTPS origin (https://bridge.your-domain): ',
  );
  if (choice === '2') {
    const account = await rl.question('Cloudflare account ID: ');
    const zone = await rl.question('Domain zone ID: ');
    const apiTokenFile = await rl.question(
      'Private file containing your scoped API token: ',
    );
    const options = { account, zone, apiTokenFile };
    console.log(await setupCloudflareApi(url, options));
    if (
      (await rl.question('Type APPLY to create the tunnel and DNS route: ')) ===
      'APPLY'
    )
      console.log(await setupCloudflareApi(url, { ...options, apply: true }));
  } else if (choice === '3') {
    console.log(await setupCloudflareBrowser(url));
    if (
      (await rl.question(
        'Type APPLY to authorize in your browser and create the tunnel/DNS route: ',
      )) === 'APPLY'
    ) {
      await ensureTunnelTool();
      cloudflareLogin();
      console.log(await setupCloudflareBrowser(url, { apply: true }));
    }
  } else if (choice === '4') {
    const tokenFile = path.resolve(
      await rl.question('Private connector token file: '),
    );
    await mkdir('.local/deployment', { recursive: true });
    await writeFile(
      '.local/deployment/settings.json',
      JSON.stringify({ url: publicUrl(url), tokenFile }),
      { mode: 0o600 },
    );
  } else if (choice === '5') console.log(await setupReverseProxy(url));
  else throw new Error('Unknown hosting option');
  console.log(
    'Hosting saved. Choose Launch > named for Cloudflare or public for an external HTTPS proxy. Follow docs/deployment.md for domain, router and Roblox Secret setup.',
  );
}
async function menu() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const active = await worlds.active();
      const running = await status();
      console.log(
        `\nMineblox Manager — ${active.name} (${active.id}) — ${running.stopped ? 'stopped' : running.profile}\n1 Worlds  2 Create world  3 Select world  4 Launch  5 Clients  6 Server console\n7 Backup world  8 Archive world  9 Stop host  10 Deployment secret  11 EULA  0 Exit`,
      );
      console.log('12 List backups / restore');
      console.log('13 Hosting setup');
      const answer = (await rl.question('Choose: ')).trim().toLowerCase();
      const aliases = {
        stop: '9',
        'stop host': '9',
        launch: '4',
        start: '4',
        console: '6',
        minecraft: '4',
        server: '4',
        studio: '4',
        both: '4',
      };
      const choice = aliases[answer] ?? answer;
      try {
        if (choice === '0') break;
        if (choice === '13') await hostingMenu(rl);
        if (choice === '1') console.table((await worlds.registry()).worlds);
        else if (choice === '2') {
          const id = await rl.question('World ID: ');
          const name = await rl.question('Display name: ');
          const seed = await rl.question('Seed (blank = random): ');
          const generator = await rl.question(
            'Generator normal/flat/large_biomes/amplified [normal]: ',
          );
          const mode = await rl.question(
            'Mode survival/creative/adventure/spectator [survival]: ',
          );
          console.log(
            await worlds.create(id, {
              name: name || id,
              seed,
              generator: generator || 'normal',
              mode: mode || 'survival',
            }),
          );
        } else if (choice === '3')
          console.log(await worlds.select(await rl.question('World ID: ')));
        else if (choice === '4') {
          const profile = ['minecraft', 'server', 'studio', 'both'].includes(
            answer,
          )
            ? answer
            : (
                await rl.question(
                  'Launch server/studio/minecraft/both/quick/named/public [both]: ',
                )
              )
                .trim()
                .toLowerCase();
          console.log(await start(profile || 'both'));
        } else if (choice === '5') {
          console.table(running.clients);
          const action = await rl.question('start/close/back: ');
          if (action === 'start')
            console.log(
              await control({
                action: 'client',
                name: await rl.question('Minecraft username: '),
              }),
            );
          else if (action === 'close')
            console.log(
              await control({
                action: 'close-client',
                name: await rl.question('Minecraft username: '),
              }),
            );
        } else if (choice === '6') await consoleSession(rl);
        else if (choice === '7')
          console.log(await worlds.backup(await rl.question('World ID: ')));
        else if (choice === '8')
          console.log(await worlds.archive(await rl.question('World ID: ')));
        else if (choice === '9') {
          if (!running.stopped) console.log(await control({ action: 'stop' }));
          else console.log('Host is already stopped');
        } else if (choice === '10')
          console.log(
            'Copy the token from this private file to Creator Hub Secret MINEBLOX_TOKEN: ' +
              (await secretFile()),
          );
        else if (choice === '12') {
          console.table(await worlds.backups());
          const backup = await rl.question('Backup ID (blank = back): ');
          if (backup)
            console.log(
              await worlds.restore(backup, await rl.question('New world ID: ')),
            );
        } else if (choice === '11') {
          console.log(
            'Review https://www.minecraft.net/en-us/eula. This applies to the locally downloaded Minecraft server.',
          );
          if ((await rl.question('Type ACCEPT if you accept: ')) === 'ACCEPT') {
            execFileSync(process.execPath, ['tools/minecraft.js', 'prepare'], {
              stdio: 'inherit',
              windowsHide: true,
            });
            await writeFile(
              '.local/minecraft/eula.txt',
              '# Accepted explicitly in Mineblox Manager\neula=true\n',
            );
          }
        } else if (!['0', '13'].includes(choice))
          console.log(
            'Unknown option. Enter a menu number, launch, console or stop host.',
          );
      } catch (error) {
        console.error(error.message);
      }
    }
  } finally {
    rl.close();
  }
  console.log(
    'Manager closed. A running host stays available; run "node tools/manager.js stop" to save and stop it.',
  );
}
const { positionals: args, values } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string' },
    name: { type: 'string' },
    generator: { type: 'string' },
    mode: { type: 'string' },
    difficulty: { type: 'string' },
    'token-file': { type: 'string' },
    'api-token-file': { type: 'string' },
    account: { type: 'string' },
    zone: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});
try {
  if (!args.length) await menu();
  else if (args[0] === 'worlds') {
    const [, action, id] = args;
    if (action === 'list') console.table((await worlds.registry()).worlds);
    else if (action === 'create') console.log(await worlds.create(id, values));
    else if (action === 'select') console.log(await worlds.select(id));
    else if (action === 'rename') await worlds.rename(id, values.name);
    else if (action === 'backup') console.log(await worlds.backup(id));
    else if (action === 'archive') console.log(await worlds.archive(id));
    else if (action === 'backups') console.table(await worlds.backups());
    else if (action === 'restore')
      console.log(await worlds.restore(id, args[3]));
    else
      throw new Error(
        'World commands: list, create, select, rename, backup, archive, backups, restore',
      );
  } else if (args[0] === 'start') console.log(await start(args[1] ?? 'both'));
  else if (args[0] === 'status') console.log(await status());
  else if (args[0] === 'stop') console.log(await control({ action: 'stop' }));
  else if (args[0] === 'console') {
    if (args.length > 1)
      console.log(
        await control({
          action: 'console',
          command: consoleCommand(args.slice(1).join(' ')),
        }),
      );
    else {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        await consoleSession(rl);
      } finally {
        rl.close();
      }
    }
  } else if (args[0] === 'client')
    console.log(
      await control({
        action: args[1] === 'close' ? 'close-client' : 'client',
        name: args[2] ?? 'MinebloxJava',
      }),
    );
  else if (args[0] === 'deploy' && args[1] === 'cloudflare-api') {
    console.log(
      await setupCloudflareApi(args[2], {
        ...values,
        apiTokenFile: values['api-token-file'],
      }),
    );
  } else if (args[0] === 'deploy' && args[1] === 'cloudflare-login') {
    await ensureTunnelTool();
    cloudflareLogin();
  } else if (args[0] === 'deploy' && args[1] === 'cloudflare-browser') {
    await ensureTunnelTool();
    console.log(await setupCloudflareBrowser(args[2], values));
  } else if (args[0] === 'deploy' && args[1] === 'reverse-proxy') {
    console.log(await setupReverseProxy(args[2]));
  } else if (args[0] === 'deploy' && args[1] === 'secret')
    console.log(await secretFile());
  else if (args[0] === 'deploy' && args[1] === 'configure') {
    const url = publicUrl(args[2]);
    const tokenFile = path.resolve(
      values['token-file'] ?? '.local/deployment/tunnel-token.txt',
    );
    await mkdir('.local/deployment', { recursive: true });
    await writeFile(
      '.local/deployment/settings.json',
      JSON.stringify({ url, tokenFile }, null, 2),
      { mode: 0o600 },
    );
    console.log(
      'Named tunnel configured. Set its origin to the saved loopback bridge URL in .local/launcher.json.',
    );
  } else
    throw new Error(
      'Commands: worlds, start [profile], status, stop, console [command], client start|close [name], deploy configure|secret',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
