import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeVoxels } from '../bridge/voxel-wire.js';
function decode(wire) {
  if (wire.encoding === 'uniform') return Array(512).fill(wire.state);
  if (wire.encoding === 'array') return wire.values;
  const out = [];
  for (let i = 0; i < wire.runs.length; i += 2)
    out.push(...Array(wire.runs[i]).fill(wire.runs[i + 1]));
  return out;
}
test('adaptive terrain codec preserves uniform, layered and worst-case partitions', () => {
  const fixtures = [
    Array(512).fill(4294967295),
    Array.from({ length: 512 }, (_, i) => (i < 256 ? 0 : 100)),
    Array.from({ length: 512 }, (_, i) => i % 2),
  ];
  const encodings = ['uniform', 'rle', 'array'];
  fixtures.forEach((values, i) => {
    const wire = encodeVoxels(values);
    assert.equal(wire.encoding, encodings[i]);
    assert.deepEqual(decode(wire), values);
  });
  for (const values of [
    Array(511).fill(0),
    Array(512).fill(-1),
    Array(512).fill(NaN),
  ])
    assert.throws(() => encodeVoxels(values));
});
