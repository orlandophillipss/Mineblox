import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { WorldStore, serverProperties } from './worlds.js';

const root = path.resolve('.local/minecraft');
const version = '1.21.4';
const jar = path.join(root, 'server.jar');
const world = await new WorldStore().active();
const worldRoot = world.directory;
const command = process.argv[2];
async function syncWorldEula() {
  if (worldRoot !== root) {
    // Worlds share the same pinned server and explicit operator acceptance.
    // Refresh an earlier eula=false copy after the operator accepts or revokes.
    await writeFile(
      path.join(worldRoot, 'eula.txt'),
      await readFile(path.join(root, 'eula.txt'), 'utf8'),
    );
  }
}
if (command === 'prepare' || command === 'configure') {
  await mkdir(root, { recursive: true });
  await mkdir(worldRoot, { recursive: true });
  if (command === 'prepare') {
    const response = await fetch(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const entry = (await response.json()).versions.find(
      (v) => v.id === version,
    );
    if (!entry) throw new Error('Pinned Minecraft version is missing');
    const metadataResponse = await fetch(entry.url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!metadataResponse.ok)
      throw new Error(`Version metadata HTTP ${metadataResponse.status}`);
    const metadataBytes = Buffer.from(await metadataResponse.arrayBuffer());
    if (createHash('sha1').update(metadataBytes).digest('hex') !== entry.sha1)
      throw new Error('Version metadata SHA-1 mismatch');
    const metadata = JSON.parse(metadataBytes);
    const download = metadata.downloads.server;
    const jarResponse = await fetch(download.url, {
      signal: AbortSignal.timeout(120000),
    });
    if (!jarResponse.ok)
      throw new Error(`Server download HTTP ${jarResponse.status}`);
    const bytes = Buffer.from(await jarResponse.arrayBuffer());
    if (
      bytes.length !== download.size ||
      createHash('sha1').update(bytes).digest('hex') !== download.sha1
    )
      throw new Error('Server download integrity mismatch');
    await writeFile(jar, bytes);
    await writeFile(
      path.join(root, 'download.json'),
      JSON.stringify(
        {
          version,
          sha1: download.sha1,
          url: download.url,
          bytes: download.size,
        },
        null,
        2,
      ),
    );
    // No automatic EULA acceptance. Existing explicit acceptance is preserved.
  }
  try {
    await writeFile(
      path.join(root, 'eula.txt'),
      '# Review https://www.minecraft.net/en-us/eula\neula=false\n',
      { flag: 'wx' },
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await syncWorldEula();
  await writeFile(
    path.join(worldRoot, 'server.properties'),
    serverProperties(world),
  );
  console.log(
    `Configured Minecraft ${version} with vanilla world generation in ${worldRoot}. Existing worlds and EULA acceptance are preserved.`,
  );
} else if (command === 'start') {
  const eula = await readFile(path.join(root, 'eula.txt'), 'utf8');
  if (!/^eula=true\s*$/m.test(eula))
    throw new Error(
      'Minecraft EULA acceptance required: review https://www.minecraft.net/en-us/eula and set eula=true in .local/minecraft/eula.txt',
    );
  await syncWorldEula();
  const child = spawn('java', ['-Xms512M', '-Xmx1G', '-jar', jar, 'nogui'], {
    cwd: worldRoot,
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} else
  throw new Error('Usage: node tools/minecraft.js prepare|configure|start');
