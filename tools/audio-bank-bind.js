import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBankManifest } from './audio-bank-config.js';
export function bindBankAssets(manifest, ids) {
  const result = structuredClone(validateBankManifest(manifest));
  if (!ids || typeof ids !== 'object' || Array.isArray(ids))
    throw new Error('Expected bank ID to permitted asset ID map');
  for (const [bank, assetId] of Object.entries(ids)) {
    if (
      !result.banks[bank] ||
      typeof assetId !== 'string' ||
      !/^rbxassetid:\/\/[1-9]\d{0,19}$/.test(assetId)
    )
      throw new Error('Unknown bank or invalid permitted asset ID');
    result.banks[bank].assetId = assetId;
  }
  return validateBankManifest(result);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const file = process.argv[2] ?? '.local/audio-banks/manifest.json';
  const ids = JSON.parse(
    await readFile(process.argv[3] ?? '.local/audio-bank-ids.json', 'utf8'),
  );
  await writeFile(
    file,
    JSON.stringify(
      bindBankAssets(JSON.parse(await readFile(file, 'utf8')), ids),
      null,
      2,
    ),
  );
  console.log(
    'Bank IDs bound. Grant the experience access to these recordings, then rebuild the place.',
  );
}
