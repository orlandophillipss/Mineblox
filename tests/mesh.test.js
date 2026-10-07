import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelRegion } from '../bridge/voxels.js';
import { greedyMesh } from '../bridge/mesh.js';

const region = (size) => new VoxelRegion({ size });
const area = (quads) => quads.reduce((n, q) => n + q.width * q.height, 0);
test('single cube, adjacent cubes, and stacked blocks eliminate hidden faces', () => {
  for (const size of [
    [1, 1, 1],
    [2, 1, 1],
    [1, 2, 1],
  ]) {
    const r = region(size);
    r.data.fill(1);
    const q = greedyMesh(r);
    assert.equal(q.length, 6);
    assert.equal(area(q), size[0] === 1 && size[1] === 1 ? 6 : 10);
  }
});
test('large plane merges into six quads while materials and holes remain distinct', () => {
  const r = region([64, 1, 64]);
  r.data.fill(1);
  assert.equal(greedyMesh(r).length, 6);
  r.set(32, 0, 32, 0);
  assert.ok(greedyMesh(r).length > 6);
  assert.equal(area(greedyMesh(r)), 64 * 64 * 2 + 64 * 4 + 2);
  const a = region([2, 1, 1]);
  a.set(0, 0, 0, 1);
  a.set(1, 0, 0, 2);
  assert.equal(greedyMesh(a).length, 10);
  assert.equal(area(greedyMesh(a)), 10);
});
test('transparent interfaces and chunk borders use explicit occlusion rules', () => {
  const a = region([2, 1, 1]);
  a.data.fill(2);
  const material = (s) =>
    s === 0 ? null : { key: String(s), opaque: s === 1 };
  assert.equal(area(greedyMesh(a, material)), 10);
  assert.equal(
    area(
      greedyMesh(a, (s) =>
        s === 0 ? null : { key: String(s), opaque: false, cullSame: false },
      ),
    ),
    12,
    'cutout foliage keeps faces behind transparent texels',
  );
  a.set(1, 0, 0, 3);
  assert.equal(area(greedyMesh(a, material)), 12);
  const b = new VoxelRegion({ size: [1, 1, 1], origin: [-16, 0, -16] });
  b.data.fill(1);
  assert.equal(
    greedyMesh(b, undefined, (p) => (p[0] === -17 ? 1 : 0)).length,
    5,
  );
  assert.ok(greedyMesh(b).some((q) => q.origin[0] === -16));
});
test('random cube worlds preserve exactly the reference exposed unit faces', () => {
  let seed = 4;
  for (let trial = 0; trial < 30; trial++) {
    const r = region([4, 4, 4]);
    r.data.forEach((_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      r.data[i] = seed % 3;
    });
    const expected = new Set();
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++)
        for (let x = 0; x < 4; x++) {
          const p = [x, y, z];
          const state = r.get(...p);
          if (!state) continue;
          for (let axis = 0; axis < 3; axis++)
            for (const sign of [-1, 1]) {
              const n = [...p];
              n[axis] += sign;
              if (n.every((v) => v >= 0 && v < 4) && r.get(...n)) continue;
              const face = [...p];
              face[axis] += sign === 1 ? 1 : 0;
              expected.add(`${axis},${sign},${face},${state}`);
            }
        }
    const actual = new Set();
    for (const q of greedyMesh(r))
      for (let j = 0; j < q.height; j++)
        for (let i = 0; i < q.width; i++) {
          const p = [...q.origin];
          p[(q.axis + 1) % 3] += i;
          p[(q.axis + 2) % 3] += j;
          const key = `${q.axis},${q.sign},${p},${q.key}`;
          assert.ok(!actual.has(key), 'No duplicate exposed face');
          actual.add(key);
        }
    assert.deepEqual(actual, expected);
  }
});
