import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const types = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};
export function validateAudioManifest(manifest) {
  if (
    !manifest ||
    manifest.rightsConfirmed !== true ||
    !/^[1-9]\d{0,19}$/.test(manifest.creatorId) ||
    !['userId', 'groupId'].includes(manifest.creatorType) ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length < 1 ||
    manifest.assets.length > 32
  )
    throw new Error(
      'Manifest needs confirmed upload rights, creatorType/userId or groupId, creatorId, and 1–32 assets',
    );
  const keys = new Set();
  for (const asset of manifest.assets) {
    if (
      !asset ||
      typeof asset.file !== 'string' ||
      !types[path.extname(asset.file).toLowerCase()] ||
      typeof asset.name !== 'string' ||
      !/^[a-zA-Z0-9_. -]{1,50}$/.test(asset.name) ||
      !['sound', 'music'].includes(asset.kind) ||
      (asset.kind === 'sound' && !/^[a-zA-Z0-9_.]{1,100}$/.test(asset.key))
    )
      throw new Error('Invalid audio file, name, kind or sound key');
    const key = asset.kind === 'sound' ? asset.key : asset.name;
    if (keys.has(key)) throw new Error('Duplicate audio mapping');
    keys.add(key);
  }
  return manifest;
}

export async function uploadAudio({
  asset,
  bytes,
  creatorType,
  creatorId,
  apiKey,
  fetchImpl = fetch,
}) {
  const form = new FormData();
  form.set(
    'request',
    JSON.stringify({
      assetType: 'Audio',
      displayName: asset.name,
      description: 'Mineblox audio imported by its authorized creator',
      creationContext: { creator: { [creatorType]: creatorId } },
    }),
  );
  form.set(
    'fileContent',
    new Blob([bytes], { type: types[path.extname(asset.file).toLowerCase()] }),
    path.basename(asset.file),
  );
  const response = await fetchImpl('https://apis.roblox.com/assets/v1/assets', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `Roblox audio upload HTTP ${response.status}; check upload permissions, quotas and audio requirements`,
    );
  const operation = await response.json();
  if (!/^operations\/[a-zA-Z0-9-]{1,100}$/.test(operation.path))
    throw new Error('Invalid upload operation path');
  return operation.path;
}

async function main() {
  const file =
    process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ??
    '.local/audio-import.json';
  const manifest = validateAudioManifest(
    JSON.parse(await readFile(file, 'utf8')),
  );
  const assets = [];
  for (const asset of manifest.assets) {
    const filename = path.resolve(path.dirname(file), asset.file);
    const info = await stat(filename);
    if (!info.isFile() || info.size < 1 || info.size >= 20 * 1024 * 1024)
      throw new Error('Audio must be a nonempty file smaller than 20 MiB');
    const bytes = await readFile(filename);
    assets.push({
      ...asset,
      bytes,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  console.log(
    `Validated ${assets.length} audio files for ${manifest.creatorType} ${manifest.creatorId}`,
  );
  if (!process.argv.includes('--upload')) {
    console.log('Preview only. Add --upload to import these authorized files.');
    return;
  }
  const apiKey = process.env.ROBLOX_OPEN_CLOUD_KEY;
  if (!apiKey)
    throw new Error(
      'Set ROBLOX_OPEN_CLOUD_KEY locally with Assets read/write permissions. Never commit or paste the key.',
    );
  let journal = {},
    config;
  try {
    journal = JSON.parse(
      await readFile('.local/audio-upload-state.json', 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    config = JSON.parse(await readFile('.local/audio.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = JSON.parse(await readFile('roblox/audio-defaults.json', 'utf8'));
  }
  const projectedSounds = new Set([
    ...Object.keys(config.sounds),
    ...assets.filter((a) => a.kind === 'sound').map((a) => a.key),
  ]);
  if (
    projectedSounds.size > 32 ||
    config.music.length + assets.filter((a) => a.kind === 'music').length > 32
  )
    throw new Error(
      'Audio configuration capacity exceeded before upload (32 effects and 32 music tracks)',
    );
  for (const asset of assets) {
    const key = [
      manifest.creatorType,
      manifest.creatorId,
      asset.name,
      asset.hash,
    ].join(':');
    let record = journal[key];
    if (!record) {
      record = journal[key] = {
        operation: await uploadAudio({
          ...manifest,
          asset,
          bytes: asset.bytes,
          apiKey,
        }),
      };
      await writeFile(
        '.local/audio-upload-state.json',
        JSON.stringify(journal, null, 2),
      );
    }
    if (!record.assetId) {
      for (let i = 0; i < 60; i++) {
        const r = await fetch(
          'https://apis.roblox.com/assets/v1/' + record.operation,
          {
            headers: { 'x-api-key': apiKey },
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!r.ok)
          throw new Error(
            `Roblox operation HTTP ${r.status}; saved operation can be resumed`,
          );
        const operation = await r.json();
        if (operation.error)
          throw new Error(
            'Roblox rejected audio processing; inspect the upload in Creator Dashboard',
          );
        if (operation.done) {
          const id = String(operation.response?.assetId ?? '');
          if (!/^\d{1,20}$/.test(id))
            throw new Error('Audio operation returned no asset ID');
          record.assetId = id;
          break;
        }
        if (i % 10 === 0) console.log(`Processing ${asset.name}…`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      await writeFile(
        '.local/audio-upload-state.json',
        JSON.stringify(journal, null, 2),
      );
      if (!record.assetId)
        throw new Error(
          'Audio processing is still pending; rerun to resume without another upload',
        );
    }
    const id = 'rbxassetid://' + record.assetId;
    if (asset.kind === 'music') {
      if (!config.music.includes(id)) config.music.push(id);
    } else config.sounds[asset.key] = id;
    if (config.music.length > 32 || Object.keys(config.sounds).length > 32)
      throw new Error(
        'Audio configuration capacity exceeded (32 effects and 32 music tracks)',
      );
    await writeFile('.local/audio.json', JSON.stringify(config, null, 2));
    console.log(`${asset.name}: ${id}`);
  }
  console.log(
    'Audio mappings saved. Restart Mineblox.bat to embed them. Grant experience access in Creator Dashboard if required.',
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve('tools/import-audio.js')
) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
