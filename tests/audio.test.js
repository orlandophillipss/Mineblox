import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAudioManifest, uploadAudio } from '../tools/import-audio.js';
const asset = {
  file: 'button.ogg',
  name: 'oak_button_click',
  kind: 'sound',
  key: 'ui',
};
const manifest = {
  rightsConfirmed: true,
  creatorType: 'userId',
  creatorId: '123',
  assets: [asset],
};
test('audio importer requires upload rights and rejects invalid or duplicate mappings', () => {
  assert.equal(validateAudioManifest(manifest), manifest);
  for (const m of [
    { ...manifest, rightsConfirmed: false },
    { ...manifest, creatorId: 'bad' },
    { ...manifest, assets: [{ ...asset, file: 'song.exe' }] },
    { ...manifest, assets: [asset, asset] },
  ])
    assert.throws(() => validateAudioManifest(m));
});
test('audio uploader sends a multipart Audio request to Roblox and constrains operation URLs', async () => {
  let request;
  const operation = await uploadAudio({
    ...manifest,
    asset,
    bytes: Buffer.from('fixture'),
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ path: 'operations/abc-123' }) };
    },
  });
  assert.equal(operation, 'operations/abc-123');
  assert.equal(request.url, 'https://apis.roblox.com/assets/v1/assets');
  assert.equal(request.options.redirect, 'error');
  const metadata = JSON.parse(request.options.body.get('request'));
  assert.equal(metadata.assetType, 'Audio');
  assert.deepEqual(metadata.creationContext.creator, { userId: '123' });
  assert.equal(request.options.body.get('fileContent').type, 'audio/ogg');
  await assert.rejects(
    uploadAudio({
      ...manifest,
      asset,
      bytes: Buffer.from('fixture'),
      apiKey: 'test',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ path: 'https://evil.test/steal' }),
      }),
    }),
    /operation path/,
  );
});
