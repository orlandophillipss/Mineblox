import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ContentStore,
  validateContent,
  EMPTY_CONTENT,
} from '../bridge/content.js';
test('published content accepts asset references and rejects raw pixels, code, broken faces and oversized data', () => {
  const content = {
    ...EMPTY_CONTENT,
    version: '1.0.0',
    images: { stone: { assetId: 'rbxassetid://123456', alpha: false } },
    blocks: { stone: Array(6).fill('stone') },
  };
  assert.deepEqual(validateContent(content), content);
  assert.throws(
    () =>
      validateContent({
        ...content,
        images: { stone: { ...content.images.stone, hex: 'aabbcc' } },
      }),
    /raw pixels/,
  );
  assert.throws(
    () => validateContent({ ...content, blocks: { stone: ['stone'] } }),
    /six face/,
  );
  assert.throws(
    () => validateContent({ ...content, items: { unknown: 'absent' } }),
    /unknown image/,
  );
  assert.throws(
    () => validateContent({ ...content, script: 'print(1)' }),
    /Unknown/,
  );
  assert.throws(
    () => validateContent({ ...content, version: 'a'.repeat(70000) }),
    /semantic version/,
  );
});
test('failed content reload keeps the last valid pack available', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mineblox-content-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'catalog.json');
  const store = new ContentStore(file);
  await writeFile(file, JSON.stringify({ ...EMPTY_CONTENT, version: '1.0.0' }));
  await store.reload();
  await writeFile(file, 'invalid');
  await assert.rejects(store.reload());
  assert.equal(store.current.version, '1.0.0');
});
