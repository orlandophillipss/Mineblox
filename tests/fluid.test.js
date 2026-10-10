import test from 'node:test';
import assert from 'node:assert/strict';
import { fluidHeight, fluidKind, fluidCorners } from '../bridge/fluid.js';
test('aquatic plants, bubble columns and waterlogged states contain water, without treating dry plants as fluid', () => {
  for (const name of [
    'water',
    'bubble_column',
    'kelp',
    'kelp_plant',
    'seagrass',
    'tall_seagrass',
  ])
    assert.equal(fluidKind({ name }), 'water');
  for (const waterlogged of [true, 'true'])
    assert.equal(
      fluidKind({ name: 'oak_slab', properties: { waterlogged } }),
      'water',
    );
  assert.equal(fluidKind({ name: 'lava' }), 'lava');
  assert.equal(fluidKind({ name: 'short_grass' }), null);
  assert.equal(
    fluidKind({ name: 'oak_slab', properties: { waterlogged: false } }),
    null,
  );
  assert.equal(fluidKind(undefined), null);
});
test('weighted fluid corners agree across neighbours and slopes use server levels', () => {
  const at = (x, y) =>
    y === 0
      ? { name: 'water', properties: { level: x <= 0 ? 0 : 5 }, shapes: [] }
      : { name: 'air', shapes: [] };
  const a = fluidCorners(at, 0, 0, 0, 'water'),
    b = fluidCorners(at, 1, 0, 0, 'water');
  assert.equal(a[2], b[1]);
  assert.equal(a[3], b[0]);
  assert.ok(a[3] < 8 / 9 && a[3] > 3 / 9);
  assert.ok(b[3] < b[0]);
  assert.deepEqual(
    fluidCorners(
      () => ({ name: 'water', properties: { level: 0 }, shapes: [] }),
      0,
      0,
      0,
      'water',
    ),
    [1, 1, 1, 1],
  );
});
test('server source, flowing, falling and submerged fluid states retain their rendered heights', () => {
  assert.equal(fluidHeight(0), 8 / 9);
  assert.equal(fluidHeight(7), 1 / 9);
  assert.equal(fluidHeight(8), 8 / 9);
  assert.equal(fluidHeight(15), 8 / 9);
  assert.equal(fluidHeight(7, true), 1);
});
