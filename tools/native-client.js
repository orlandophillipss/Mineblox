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
const root = path.resolve('.local/native-client');
const version = '1.21.4';
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
  const manifest = await (
    await fetch(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    )
  ).json();
  const entry = manifest.versions.find((v) => v.id === version);
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
function allowed(rules) {
  if (!rules) return true;
  let allow = false;
  for (const rule of rules)
    if (
      !rule.features &&
      (!rule.os ||
        ((!rule.os.name || rule.os.name === 'windows') &&
          (!rule.os.arch || new RegExp(rule.os.arch).test('amd64'))))
    )
      allow = rule.action === 'allow';
  return allow;
}
for (const library of metadata.libraries) {
  if (!allowed(library.rules)) continue;
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
await writeFile(
  path.join(gameDir, 'options.txt'),
  'renderDistance:6\nsimulationDistance:5\nmaxFps:60\nguiScale:2\n',
);
const name = 'MCGraphObserver';
const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest();
bytes[6] = (bytes[6] & 15) | 48;
bytes[8] = (bytes[8] & 63) | 128;
const hex = bytes.toString('hex');
const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
let java = process.env.MINEBLOX_JAVA ?? 'java';
if (!process.env.MINEBLOX_JAVA) {
  try {
    const directories = await readdir('.local/tools/java21', {
      withFileTypes: true,
    });
    const runtime = directories.find(
      (d) => d.isDirectory() && d.name.startsWith('jdk-21'),
    );
    if (runtime)
      java = path.resolve('.local/tools/java21', runtime.name, 'bin/java.exe');
  } catch {
    /* Use the installed launcher runtime. */
  }
}
const log = openSync(path.join(root, 'client.log'), 'a');
const child = spawn(
  java,
  [
    '-Xmx1G',
    '-Xss4M',
    `-Djava.library.path=${path.join(root, 'natives')}`,
    `-Dorg.lwjgl.librarypath=${path.join(root, 'natives')}`,
    '-cp',
    classpath.join(path.delimiter),
    metadata.mainClass,
    '--username',
    name,
    '--version',
    version,
    '--gameDir',
    gameDir,
    '--assetsDir',
    assets,
    '--assetIndex',
    metadata.assetIndex.id,
    '--uuid',
    uuid,
    '--accessToken',
    '0',
    '--userType',
    'legacy',
    '--versionType',
    'release',
    '--width',
    '960',
    '--height',
    '600',
    '--quickPlayMultiplayer',
    '127.0.0.1:25565',
  ],
  {
    windowsHide: false,
    detached: true,
    stdio: ['ignore', log, log],
    cwd: gameDir,
  },
);
closeSync(log);
console.log(`Official Minecraft GUI launched as ${name}, PID ${child.pid}`);
if (process.argv.includes('--stay-open'))
  await new Promise((resolve) =>
    child.once('exit', (code, signal) => {
      console.log(`Minecraft GUI exited: ${code ?? signal}`);
      if (code !== 0) process.exitCode = 1;
      resolve();
    }),
  );
else child.unref();
