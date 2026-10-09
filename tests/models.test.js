import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matches,
  selectModels,
  modelFaces,
  stateFaces,
} from '../bridge/models.js';
test('partial face UVs retain pixel scale, orientation and explicit clockwise rotation', () => {
  const model = {
    textures: { all: 'minecraft:block/stone' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          west: { texture: '#all' },
          south: { texture: '#all', uv: [0, 0, 16, 16], rotation: 90 },
        },
      },
    ],
  };
  const [west, south] = modelFaces(model);
  for (let i = 0; i < 4; i++)
    assert.equal(west.uv[i][1], 1 - west.points[i][1]);
  assert.deepEqual([...new Set(west.uv.map((p) => p[1]))].sort(), [0.5, 1]);
  for (let i = 0; i < 4; i++)
    assert.deepEqual(south.uv[i], [
      1 - south.points[i][1] * 2,
      1 - south.points[i][0],
    ]);
  const rotated = modelFaces(model, { y: 90 });
  assert.deepEqual(rotated[0].uv, west.uv, 'rotation carries the element UVs');
});
test('declared bare face aliases resolve without guessing undeclared texture names', () => {
  const model = {
    textures: { all: 'block/heavy_core' },
    elements: [
      {
        from: [4, 0, 4],
        to: [12, 8, 12],
        faces: { up: { texture: 'all', uv: [0, 0, 8, 8] } },
      },
    ],
  };
  assert.equal(
    modelFaces(model)[0].texture,
    'assets/minecraft/textures/block/heavy_core.png',
  );
});
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
