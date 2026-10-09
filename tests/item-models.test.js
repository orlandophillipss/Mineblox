import test from 'node:test';
import assert from 'node:assert/strict';
import { compileItem, auditItems } from '../bridge/item-models.js';
const cube = {
  textures: { all: 'minecraft:block/oak_planks' },
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: { up: { texture: '#all' }, north: { texture: '#all' } },
    },
  ],
  display: { gui: { rotation: [30, 225, 0] } },
};
test('generated layers retain per-layer tints and reject unsupported dynamic components', async () => {
  let tints = [
    { type: 'minecraft:constant', value: 0x804020 },
    { type: 'minecraft:constant', value: [1, 0, 0.5] },
  ];
  const store = {
    json: async () => ({
      model: {
        type: 'minecraft:model',
        model: 'minecraft:item/template_spawn_egg',
        tints,
      },
    }),
    model: async () => ({
      generated: true,
      textures: {
        layer0: 'minecraft:item/spawn_egg',
        layer1: 'minecraft:item/spawn_egg_overlay',
      },
    }),
  };
  const layers = [];
  const result = await compileItem(
    store,
    'pig_spawn_egg',
    async () => {},
    async (name, input) => {
      layers.push(...input);
      return `generated/items/${name}.png`;
    },
  );
  assert.equal(result.texture, 'generated/items/pig_spawn_egg.png');
  assert.deepEqual(
    layers.map((l) => l.tint),
    [
      [128, 64, 32],
      [255, 0, 128],
    ],
  );
  tints = [{ type: 'minecraft:potion', default: 0xff00ff }];
  await assert.rejects(
    compileItem(
      store,
      'potion',
      async () => {},
      async () => '',
    ),
    /stack component/,
  );
});
test('1.21.4 item definitions resolve actual referenced models and sprites, not guessed block faces', async () => {
  const loaded = [];
  const store = {
    json: async (p) => {
      assert.equal(p, 'assets/minecraft/items/oak_planks.json');
      return {
        model: { type: 'minecraft:model', model: 'minecraft:block/oak_planks' },
      };
    },
    model: async (p) => {
      assert.equal(p, 'minecraft:block/oak_planks');
      return cube;
    },
  };
  const item = await compileItem(store, 'oak_planks', async (p) =>
    loaded.push(p),
  );
  assert.equal(item.kind, 'mesh');
  assert.equal(item.faces.length, 2);
  assert.deepEqual(item.display, cube.display);
  assert.ok(
    loaded.every((p) => p === 'assets/minecraft/textures/block/oak_planks.png'),
  );
  store.model = async () => ({
    generated: true,
    textures: { layer0: 'minecraft:item/stick' },
  });
  const sprite = await compileItem(store, 'oak_planks', async () => {});
  assert.equal(sprite.texture, 'assets/minecraft/textures/item/stick.png');
});
test('unsupported special/dynamic models are reported, and GUI context selects its own representation', async () => {
  let node = { type: 'minecraft:special' };
  const store = {
    json: async () => ({ model: node }),
    model: async () => cube,
  };
  await assert.rejects(
    compileItem(store, 'chest', async () => {}),
    /Unsupported/,
  );
  node = {
    type: 'minecraft:select',
    property: 'minecraft:display_context',
    cases: [
      {
        when: ['gui'],
        model: { type: 'minecraft:model', model: 'minecraft:block/oak_planks' },
      },
    ],
  };
  assert.equal(
    (await compileItem(store, 'oak_planks', async () => {})).kind,
    'mesh',
  );
  const report = auditItems(
    {
      itemsArray: [{ name: 'air' }, { name: 'oak_planks' }, { name: 'chest' }],
    },
    { oak_planks: {} },
    { chest: 'Unsupported special model' },
  );
  assert.equal(report.supportedCount, 1);
  assert.deepEqual(report.unresolved, [
    { name: 'chest', reason: 'Unsupported special model' },
  ]);
});
