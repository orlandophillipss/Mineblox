import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import mineflayer from 'mineflayer';
import { createGateway } from '../bridge/gateway.js';
import { buildPlace } from './build-place.js';
import { openStudio } from './open-studio.js';
import { clearRequiredPorts } from './startup-processes.js';
import { createInterface } from 'node:readline';
import { offlineUuid } from './client-launch.js';
import { waitForLocalServer } from './client-server.js';
import { WorldStore } from './worlds.js';
import { acquireHostLock } from './host-lock.js';
import { startTunnel } from './tunnel.js';
import { ContentStore } from '../bridge/content.js';
import { createHostControl } from './host-control.js';

const children = [];
const contentStore = new ContentStore();
let releaseLock;
let hostControl,
  hostReady = false;
const consoleLines = [];
let gateway,
  minecraft,
  nativeClient,
  stopping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await mkdir('.local/logs', { recursive: true });
const log = (name) =>
  createWriteStream(`.local/logs/${name}.log`, { flags: 'a' });
function launch(command, args, name, options = {}) {
  const output = log(name);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  child.stdout?.pipe(output);
  child.stderr?.pipe(output);
  if (name === 'minecraft') {
    child.stdout.on('data', (data) => {
      for (const line of data.toString().slice(-32768).split(/\r?\n/))
        if (line) consoleLines.push(line.slice(0, 1000));
      consoleLines.splice(0, Math.max(0, consoleLines.length - 40));
    });
    child.stdout?.pipe(process.stdout, { end: false });
    child.stderr?.pipe(process.stderr, { end: false });
  }
  child.once('error', (error) => {
    console.error(`${name}: ${error.message}`);
    void shutdown(1);
  });
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${name} stopped (${code}). See .local/logs/${name}.log`);
      void shutdown(1);
    }
  });
  children.push(child);
  return child;
}
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('Stopping the bridge and saving the Minecraft world…');
  await gateway?.close();
  if (minecraft?.stdin.writable) minecraft.stdin.write('stop\n');
  if (nativeClient?.stdin.writable) nativeClient.stdin.end('stop\n');
  for (const child of children)
    if (child !== minecraft && child !== nativeClient) child.kill();
  if (minecraft) {
    for (let i = 0; i < 100 && minecraft.exitCode === null; i++)
      await sleep(100);
    if (minecraft.exitCode === null) minecraft.kill();
  }
  if (nativeClient) {
    for (
      let i = 0;
      i < 50 &&
      nativeClient.exitCode === null &&
      nativeClient.signalCode === null;
      i++
    )
      await sleep(100);
    if (nativeClient.exitCode === null && nativeClient.signalCode === null)
      nativeClient.kill();
  }
  await hostControl?.close();
  await releaseLock?.();
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => void shutdown());
{
  const control = createInterface({ input: process.stdin });
  control.on('line', (line) => {
    if (line === 'stop') void shutdown();
    else {
      const command = process.argv.includes('--managed-pipe')
        ? line.startsWith('console ')
          ? line.slice(8)
          : null
        : line;
      if (
        command &&
        command.length <= 512 &&
        ![...command].some((c) => c.charCodeAt(0) < 32) &&
        minecraft?.stdin.writable
      )
        minecraft.stdin.write(command + '\n');
    }
  });
  if (process.argv.includes('--managed-pipe'))
    control.once('close', () => void shutdown());
}
try {
  const nameIndex = process.argv.indexOf('--minecraft-name');
  const nativeName =
    nameIndex < 0 ? 'MinebloxJava' : process.argv[nameIndex + 1];
  if (process.argv.includes('--minecraft-client')) offlineUuid(nativeName);
  releaseLock = await acquireHostLock();
  hostControl = await createHostControl({
    status: () => ({
      stopped: false,
      profile: 'standalone',
      hostPid: process.pid,
      ready: hostReady,
      stopping,
      controllable: true,
      clients: [],
      console: consoleLines,
    }),
    console: (command) => {
      if (!minecraft?.stdin.writable) throw new Error('Minecraft is not ready');
      minecraft.stdin.write(command + '\n');
    },
    stop: () => void shutdown(),
  });
  const world = await new WorldStore().active();
  await rm('.local/ready.json', { force: true });
  try {
    await access('.local/minecraft/server.jar');
  } catch {
    execFileSync(process.execPath, ['tools/minecraft.js', 'prepare'], {
      stdio: 'inherit',
      windowsHide: true,
    });
  }
  const eula = await readFile('.local/minecraft/eula.txt', 'utf8');
  if (!/^eula=true\s*$/m.test(eula))
    throw new Error(
      'Accept the Minecraft EULA in .local/minecraft/eula.txt before starting. https://www.minecraft.net/en-us/eula',
    );
  let previous;
  try {
    previous = JSON.parse(await readFile('.local/launcher.json', 'utf8'));
  } catch {
    /* First launch. */
  }
  const savedPort = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(
    previous?.url ?? '',
  );
  const reusable =
    previous &&
    /^[a-f0-9]{64}$/.test(previous.token) &&
    savedPort &&
    Number(savedPort[1]) > 0 &&
    Number(savedPort[1]) <= 65535 &&
    Number(savedPort[1]) !== 25565;
  const token = reusable ? previous.token : randomBytes(32).toString('hex');
  const configuredPort =
    process.env.MINEBLOX_GATEWAY_PORT === undefined
      ? null
      : Number(process.env.MINEBLOX_GATEWAY_PORT);
  if (
    configuredPort !== null &&
    (!Number.isInteger(configuredPort) ||
      configuredPort < 1 ||
      configuredPort > 65535 ||
      configuredPort === 25565)
  )
    throw new Error('Invalid MINEBLOX_GATEWAY_PORT');
  const preferredPort =
    configuredPort ?? (reusable ? Number(new URL(previous.url).port) : 0);
  if (process.platform === 'win32') {
    for (const owner of clearRequiredPorts([25565, preferredPort])) {
      console.log(
        `Stopped ${owner.name} (PID ${owner.pid}) using required port(s) ${owner.ports.join(', ')}.`,
      );
    }
  } else if (
    (await portOpen(25565)) ||
    (preferredPort && (await portOpen(preferredPort)))
  ) {
    throw new Error(
      'A required development port is occupied. Automatic port cleanup is supported on Windows.',
    );
  }
  execFileSync(process.execPath, ['tools/minecraft.js', 'configure'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  const java = process.env.MINEBLOX_JAVA ?? 'java';
  console.log('Starting Minecraft Java 1.21.4…');
  minecraft = launch(
    java,
    [
      '-Xms512M',
      '-Xmx1G',
      '-jar',
      path.resolve('.local/minecraft/server.jar'),
      'nogui',
    ],
    'minecraft',
    { cwd: world.directory },
  );
  await waitForLocalServer(minecraft);
  const bridgeLog = log('bridge');
  try {
    await contentStore.reload();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const contentPoll = setInterval(() => {
    void contentStore.reload().catch((error) => {
      if (error.code !== 'ENOENT')
        console.error(`Content update rejected: ${error.message}`);
    });
  }, 60000);
  contentPoll.unref();
  let models = {};
  try {
    models = JSON.parse(
      await readFile('.local/roblox/model-catalog.json', 'utf8'),
    );
  } catch {
    /* Basic geometry remains available. */
  }
  gateway = createGateway({
    token,
    models,
    terrainRadius: 3,
    minecraft: { host: '127.0.0.1', port: 25565, version: '1.21.4' },
    createBot: mineflayer.createBot,
    requireOwner:
      process.argv.includes('--tunnel') ||
      process.env.MINEBLOX_DEPLOYMENT === 'true',
    content: () => contentStore.current,
    log: (record) => bridgeLog.write(JSON.stringify(record) + '\n'),
  });
  await new Promise((resolve, reject) => {
    gateway.server.once('error', reject);
    gateway.server.listen(preferredPort, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${gateway.server.address().port}`;
  const health = await fetch(`${url}/health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!health.ok) throw new Error('Local bridge health check failed');
  await writeFile(
    '.local/launcher.json',
    JSON.stringify({ url, token, localUrl: url }, null, 2),
  );
  let remoteUrl;
  if (process.argv.includes('--tunnel')) {
    const mode = process.argv[process.argv.indexOf('--tunnel') + 1];
    const tunnel = await startTunnel(mode, url);
    children.push(tunnel.child);
    remoteUrl = tunnel.url;
    tunnel.child.once('exit', () => {
      if (!stopping) {
        console.error('Remote tunnel disconnected; stopping services.');
        void shutdown(1);
      }
    });
    // Never send the bearer token to a public diagnostic tool or logger.
    console.log(`Remote Roblox bridge: ${remoteUrl}`);
    await writeFile(
      '.local/deployment-endpoint.json',
      JSON.stringify(
        {
          url: remoteUrl,
          mode,
          world: world.id,
          secretName: 'MINEBLOX_TOKEN',
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  const place = process.argv.includes('--no-studio')
    ? null
    : await buildPlace({ url: remoteUrl ?? url, token });
  if (!process.argv.includes('--no-studio')) {
    console.log('Opening the generated Roblox place…');
    await openStudio(place);
    const automation = spawn(process.execPath, ['tools/studio-auto.js'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    automation.on('error', (error) =>
      console.log(`Studio automation: ${error.message}`),
    );
  }
  console.log(
    process.argv.includes('--no-studio')
      ? 'READY — Local Minecraft server and bridge are running.'
      : 'READY — In Studio, press Play. WASD moves; Space jumps; Ctrl sprints; Shift sneaks; Tab releases the cursor.',
  );
  hostReady = true;
  console.log(
    'Server console: say hi | op username | list | stop (save and close)',
  );
  console.log(
    'Keep this window open. Ctrl+C stops services and saves the world. Native Minecraft clients can join 127.0.0.1:25565.',
  );
  await writeFile(
    '.local/ready.json',
    JSON.stringify({ ready: true, place, startedAt: new Date().toISOString() }),
  );
  if (process.argv.includes('--minecraft-client')) {
    nativeClient = spawn(
      process.execPath,
      [
        'tools/native-client.js',
        '--username',
        nativeName,
        '--stay-open',
        '--managed-pipe',
      ],
      { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
    );
    children.push(nativeClient);
    nativeClient.stdin.on('error', (error) =>
      console.error(`Minecraft client control: ${error.message}`),
    );
    nativeClient.on('error', (error) =>
      console.error(`Minecraft client: ${error.message}`),
    );
  }
  setInterval(() => {}, 10000);
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
