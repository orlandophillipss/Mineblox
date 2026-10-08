// Official Minecraft GUI client for the explicitly authorized loopback test.
// Offline development identity only; never read launcher credentials.
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
} from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { clientArguments, offlineUuid, rulesAllow } from './client-launch.js';
import { ensureLocalServer, stopOwnedServer } from './client-server.js';
import { createInterface } from 'node:readline';
const root = path.resolve('.local/native-client');
const version = '1.21.4';
if (process.platform !== 'win32')
  throw new Error('The direct client launcher currently supports Windows');
const nameIndex = process.argv.indexOf('--username');
const name = nameIndex < 0 ? 'MinebloxJava' : process.argv[nameIndex + 1];
const uuid = offlineUuid(name);
const digest = (b) => createHash('sha1').update(b).digest('hex');
await mkdir(root, { recursive: true });
async function get(url, file, sha1, size) {
  try {
    const bytes = await readFile(file);
    if (digest(bytes) === sha1 && (!size || bytes.length === size)) return file;
  } catch {
    /* Download verified official data below. */
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    ![
      'piston-meta.mojang.com',
      'piston-data.mojang.com',
      'libraries.minecraft.net',
      'resources.download.minecraft.net',
    ].includes(parsed.hostname)
  )
    throw new Error('Unexpected official Minecraft download host');
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error(`Minecraft download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== sha1 || (size && bytes.length !== size))
    throw new Error('Minecraft client integrity mismatch');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}
let metadata;
try {
  metadata = JSON.parse(
    await readFile(path.join(root, 'version.json'), 'utf8'),
  );
} catch {
  console.log('Downloading official Minecraft 1.21.4 client metadata…');
  const response = await fetch(
    'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw new Error(`Minecraft metadata HTTP ${response.status}`);
  const manifest = await response.json();
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry)
    throw new Error(
      'Pinned Minecraft client version is absent from the official manifest',
    );
  await get(entry.url, path.join(root, 'version.json'), entry.sha1);
  metadata = JSON.parse(
    await readFile(path.join(root, 'version.json'), 'utf8'),
  );
}
const classpath = [
  await get(
    metadata.downloads.client.url,
    path.join(root, 'client.jar'),
    metadata.downloads.client.sha1,
    metadata.downloads.client.size,
  ),
];
console.log('Preparing verified client libraries and game assets…');
for (const library of metadata.libraries) {
  if (!rulesAllow(library.rules)) continue;
  const a = library.downloads.artifact;
  if (a)
    classpath.push(
      await get(a.url, path.join(root, 'libraries', a.path), a.sha1, a.size),
    );
}
const assets = path.join(root, 'assets');
await get(
  metadata.assetIndex.url,
  path.join(assets, 'indexes', `${metadata.assetIndex.id}.json`),
  metadata.assetIndex.sha1,
  metadata.assetIndex.size,
);
const index = JSON.parse(
  await readFile(
    path.join(assets, 'indexes', `${metadata.assetIndex.id}.json`),
    'utf8',
  ),
);
const objects = Object.values(index.objects);
let cursor = 0,
  downloaded = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < objects.length) {
      const a = objects[cursor++],
        rel = path.join(a.hash.slice(0, 2), a.hash),
        file = path.join(assets, 'objects', rel);
      try {
        const bytes = await readFile(file);
        if (digest(bytes) === a.hash) continue;
      } catch {
        /* Reuse installed private assets. */
      }
      const installed = path.join(
        process.env.APPDATA ?? '',
        '.minecraft',
        'assets',
        'objects',
        rel,
      );
      try {
        const bytes = await readFile(installed);
        if (digest(bytes) === a.hash) {
          await mkdir(path.dirname(file), { recursive: true });
          await copyFile(installed, file);
          continue;
        }
      } catch {
        /* Download missing official object. */
      }
      await get(
        `https://resources.download.minecraft.net/${a.hash.slice(0, 2)}/${a.hash}`,
        file,
        a.hash,
        a.size,
      );
      downloaded++;
      if (downloaded % 100 === 0)
        console.log(
          `Downloaded ${downloaded} missing Minecraft asset objects…`,
        );
    }
  }),
);
console.log(
  `Prepared official ${version} GUI client; ${downloaded} missing asset objects downloaded`,
);
await mkdir(path.join(root, 'natives'), { recursive: true });
for (const file of classpath.filter((f) => f.includes('natives-windows')))
  execFileSync('tar.exe', ['-xf', file, '-C', path.join(root, 'natives')], {
    windowsHide: true,
    stdio: 'ignore',
  });
const gameDir = path.join(root, 'game');
await mkdir(gameDir, { recursive: true });
try {
  await writeFile(
    path.join(gameDir, 'options.txt'),
    'renderDistance:6\nsimulationDistance:5\nmaxFps:60\nguiScale:2\n',
    { flag: 'wx' },
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
if (process.argv.includes('--prepare-only')) process.exit(0);
let java =
  process.env.MINEBLOX_CLIENT_JAVA ?? process.env.MINEBLOX_JAVA ?? 'javaw';
if (!process.env.MINEBLOX_CLIENT_JAVA && !process.env.MINEBLOX_JAVA) {
  try {
    const directories = await readdir('.local/tools/java21', {
      withFileTypes: true,
    });
    const runtime = directories.find(
      (d) => d.isDirectory() && d.name.startsWith('jdk-21'),
    );
    if (runtime)
      java = path.resolve('.local/tools/java21', runtime.name, 'bin/javaw.exe');
  } catch {
    /* Use the installed launcher runtime. */
  }
}
const server = await ensureLocalServer(
  process.argv.includes('--ensure-server'),
);
try {
  const args = clientArguments(metadata, {
    natives_directory: path.join(root, 'natives'),
    classpath: classpath.join(path.delimiter),
    launcher_name: 'Mineblox',
    launcher_version: '0.2.0',
    auth_player_name: name,
    version_name: version,
    game_directory: gameDir,
    assets_root: assets,
    assets_index_name: metadata.assetIndex.id,
    auth_uuid: uuid,
    auth_access_token: '0',
    clientid: '0',
    auth_xuid: '0',
    user_type: 'legacy',
    version_type: 'release',
    resolution_width: 1280,
    resolution_height: 720,
    quickPlayPath: 'quickPlay/mineblox.json',
    quickPlayMultiplayer: '127.0.0.1:25565',
  });
  const log = openSync(path.join(root, 'client.log'), 'a');
  let child;
  try {
    child = spawn(java, args, {
      windowsHide: false,
      detached: true,
      stdio: ['ignore', log, log],
      cwd: gameDir,
    });
  } finally {
    closeSync(log);
  }
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  console.log(`Official Minecraft GUI launched as ${name}, PID ${child.pid}`);
  if (
    process.argv.includes('--stay-open') ||
    server ||
    process.argv.includes('--managed-pipe')
  ) {
    let requestedStop = false;
    const stop = () => {
      requestedStop = true;
      if (child.exitCode === null && child.signalCode === null) child.kill();
    };
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
    const control = process.argv.includes('--managed-pipe')
      ? createInterface({ input: process.stdin })
      : null;
    control?.on('line', (line) => {
      if (line === 'stop') stop();
    });
    control?.once('close', stop);
    await new Promise((resolve) =>
      child.once('exit', (code, signal) => {
        console.log(`Minecraft GUI exited: ${code ?? signal}`);
        if (code !== 0 && !requestedStop) {
          process.exitCode = 1;
          console.error(
            'See .local/native-client/client.log for Minecraft launch diagnostics.',
          );
        }
        resolve();
      }),
    );
    control?.close();
    for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, stop);
  } else child.unref();
} finally {
  await stopOwnedServer(server);
}
