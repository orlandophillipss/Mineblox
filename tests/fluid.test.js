import test from 'node:test';
import assert from 'node:assert/strict';
import { fluidHeight, fluidKind } from '../bridge/fluid.js';
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
test('server source, flowing, falling and submerged fluid states retain their rendered heights', () => {
  assert.equal(fluidHeight(0), 8 / 9);
  assert.equal(fluidHeight(7), 1 / 9);
  assert.equal(fluidHeight(8), 8 / 9);
  assert.equal(fluidHeight(15), 8 / 9);
  assert.equal(fluidHeight(7, true), 1);
});
