import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VoxelRegion,
  encodeSnapshot,
  decodeSnapshot,
} from '../bridge/voxels.js';

test('snapshot preserves state IDs, negative coordinates, and revision', () => {
  const a = new VoxelRegion({
    size: [3, 2, 4],
    origin: [-16, -64, -32],
    revision: 42,
  });
  a.set(2, 1, 3, 12345);
  const b = decodeSnapshot(encodeSnapshot(a));
  assert.deepEqual(b, a);
  assert.throws(() => a.set(-1, 0, 0, 1));
});

test('snapshot plus deltas is recoverable, stale-safe, and atomic', () => {
  const region = new VoxelRegion({ size: [2, 2, 2], revision: 10 });
  const delta = {
    base: 10,
    revision: 11,
    changes: [{ x: 1, y: 0, z: 0, state: 9 }],
  };
  assert.equal(region.applyDelta(delta), 'applied');
  assert.equal(region.applyDelta(delta), 'stale');
  assert.equal(region.get(1, 0, 0), 9);
  assert.equal(
    region.applyDelta({ base: 12, revision: 13, changes: [] }),
    'resync',
  );
  assert.throws(() =>
    region.applyDelta({
      base: 11,
      revision: 12,
      changes: [
        { x: 0, y: 0, z: 0, state: 7 },
        { x: 9, y: 0, z: 0, state: 2 },
      ],
    }),
  );
  assert.equal(region.get(0, 0, 0), 0);
  assert.equal(region.revision, 11);
});

test('bounded parser rejects truncation, trailing bytes, dimensions, flags, and versions', () => {
  const valid = encodeSnapshot(new VoxelRegion({ size: [2, 2, 2] }));
  for (let length = 0; length < valid.length; length++)
    assert.throws(() => decodeSnapshot(valid.subarray(0, length)));
  assert.throws(() => decodeSnapshot(Buffer.concat([valid, Buffer.from([0])])));
  for (const offset of [0, 4, 6, 24, 30]) {
    const bad = Buffer.from(valid);
    bad[offset] = 255;
    assert.throws(() => decodeSnapshot(bad));
  }
});

test('deterministic parser fuzz corpus cannot escape allocation bounds', () => {
  let seed = 123456;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < 1000; i++) {
    const data = Buffer.alloc(next() % 256);
    for (let j = 0; j < data.length; j++) data[j] = next() & 255;
    try {
      const decoded = decodeSnapshot(data);
      assert.ok(decoded.data.length <= 64 ** 3);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  }
});
