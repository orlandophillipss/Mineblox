import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetStore, resolveTexture, ASSET_ORIGIN } from '../bridge/assets.js';

test('mcasset provider pins version, validates endpoint, caches, and detects corruption', async (t) => {
  const cache = await mkdtemp(path.join(tmpdir(), 'mineblox-assets-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  let calls = 0;
  const relative = 'assets/minecraft/models/block/stone.json';
  const store = new AssetStore({
    version: '1.21.4',
    cache,
    allowRemote: true,
    fetchImpl: async (url) => {
      calls++;
      assert.equal(url, `${ASSET_ORIGIN}/1.21.4/${relative}`);
      return new Response('{"parent":"minecraft:block/cube_all"}', {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await store.get(relative);
  await store.get(relative);
  assert.equal(calls, 1);
  const meta = JSON.parse(
    await readFile(
      path.join(store.cache, `${relative}.integrity.json`),
      'utf8',
    ),
  );
  assert.equal(meta.sha256.length, 64);
  await writeFile(path.join(store.cache, relative), '{}');
  await assert.rejects(store.get(relative), /integrity/);
  assert.throws(() => new AssetStore({ version: 'latest' }));
  await assert.rejects(store.get('../secret'), /path/);
});

test('remote access is opt-in and model inheritance/texture aliases are bounded', async (t) => {
  const cache = await mkdtemp(path.join(tmpdir(), 'mineblox-models-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  const store = new AssetStore({ version: '1.21.4', cache });
  await assert.rejects(
    store.get('assets/minecraft/models/block/a.json'),
    /opt in/,
  );
  store.json = async (p) =>
    p.endsWith('/a.json')
      ? { parent: 'block/b', textures: { all: 'block/stone' } }
      : { elements: [{ from: [0, 0, 0] }], textures: { side: '#all' } };
  const model = await store.model('minecraft:block/a');
  assert.equal(model.elements.length, 1);
  assert.equal(
    resolveTexture(model.textures, '#side'),
    'assets/minecraft/textures/block/stone.png',
  );
  assert.throws(() => resolveTexture({ a: '#b', b: '#a' }, '#a'), /Cyclic/);
  store.json = async () => ({ parent: 'block/a' });
  await assert.rejects(store.model('minecraft:block/a'), /cyclic/);
});

test('asset HTTP errors, HTML, invalid PNG, and oversized responses fail safely', async (t) => {
  const cache = await mkdtemp(path.join(tmpdir(), 'mineblox-errors-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  for (const response of [
    new Response('no', { status: 404 }),
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    new Response('bad', { headers: { 'content-type': 'image/png' } }),
    new Response('bad', {
      headers: {
        'content-type': 'image/png',
        'content-length': String(3 * 1024 * 1024),
      },
    }),
  ]) {
    const store = new AssetStore({
      version: '1.21.4',
      cache,
      allowRemote: true,
      fetchImpl: async () => response,
    });
    await assert.rejects(
      store.get('assets/minecraft/textures/block/stone.png'),
    );
  }
});
