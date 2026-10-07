import test from 'node:test';
import assert from 'node:assert/strict';
import { fluidHeight } from '../bridge/fluid.js';
test('server source, flowing, falling and submerged fluid states retain their rendered heights', () => {
  assert.equal(fluidHeight(0), 8 / 9);
  assert.equal(fluidHeight(7), 1 / 9);
  assert.equal(fluidHeight(8), 8 / 9);
  assert.equal(fluidHeight(15), 8 / 9);
  assert.equal(fluidHeight(7, true), 1);
});
