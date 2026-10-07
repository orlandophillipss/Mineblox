import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matches,
  selectModels,
  modelFaces,
  stateFaces,
} from '../bridge/models.js';
test('blockstate variants and multipart conditions select only compatible models', () => {
  assert.ok(
    matches(
      { OR: [{ north: 'true' }, { east: 'true' }] },
      { north: false, east: true },
    ),
  );
  assert.ok(
    !matches(
      { AND: [{ half: 'top' }, { facing: 'north|east' }] },
      { half: 'bottom', facing: 'east' },
    ),
  );
  const s = {
    variants: {
      'half=top': { model: 'top' },
      'half=bottom': { model: 'bottom' },
    },
    multipart: [{ when: { north: 'true' }, apply: { model: 'north' } }],
  };
  assert.deepEqual(
    selectModels(s, { half: 'bottom', north: true }).map((v) => v.model),
    ['bottom', 'north'],
  );
});
test('model compiler resolves face textures, bounded elements, and model rotations', () => {
  const model = {
    textures: { all: 'minecraft:block/oak_planks' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          up: { texture: '#all', uv: [0, 0, 16, 16] },
          west: { texture: '#all' },
        },
      },
    ],
  };
  const faces = modelFaces(model, { y: 90 });
  assert.equal(faces.length, 2);
  assert.equal(
    faces[0].texture,
    'assets/minecraft/textures/block/oak_planks.png',
  );
  assert.ok(
    faces
      .flatMap((f) => f.points)
      .every((p) => p.every((n) => n >= -1e-9 && n <= 1 + 1e-9)),
  );
  const catalog = {
    oak_slab: {
      blockstate: { variants: { 'type=bottom': { model: 'slab' } } },
      models: { slab: model },
    },
  };
  assert.equal(stateFaces(catalog, 'oak_slab', { type: 'bottom' }).length, 2);
  assert.equal(stateFaces(catalog, 'unknown', {}), null);
});
