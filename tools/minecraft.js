import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.local/minecraft');
const version = '1.21.4';
const jar = path.join(root, 'server.jar');
const command = process.argv[2];
if (command === 'prepare' || command === 'configure') {
  await mkdir(root, { recursive: true });
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
  await writeFile(
    path.join(root, 'server.properties'),
    [
      'server-ip=127.0.0.1',
      'server-port=25565',
      'online-mode=false',
      'enforce-secure-profile=false',
      'level-name=mineblox-overworld',
      'level-type=minecraft:normal',
      'level-seed=12345',
      'generate-structures=true',
      'spawn-protection=0',
      'gamemode=survival',
      'difficulty=normal',
      'view-distance=3',
      'simulation-distance=3',
      'max-players=20',
      'enable-rcon=false',
      'enable-query=false',
    ].join('\n') + '\n',
  );
  console.log(
    `Configured Minecraft ${version} with vanilla world generation in ${root}. Existing worlds and EULA acceptance are preserved.`,
  );
} else if (command === 'start') {
  const eula = await readFile(path.join(root, 'eula.txt'), 'utf8');
  if (!/^eula=true\s*$/m.test(eula))
    throw new Error(
      'Minecraft EULA acceptance required: review https://www.minecraft.net/en-us/eula and set eula=true in .local/minecraft/eula.txt',
    );
  const child = spawn('java', ['-Xms512M', '-Xmx1G', '-jar', jar, 'nogui'], {
    cwd: root,
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
