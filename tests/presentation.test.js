import test from 'node:test';
import assert from 'node:assert/strict';
import {
  skyExposure,
  eyeSkyLight,
  fishVariant,
} from '../bridge/presentation.js';
test('loaded sky light distinguishes a shaded canopy from an unlit cave', () => {
  const bot = {
    entity: { position: { x: -1, y: 64, z: -1 } },
    world: {
      getColumn: () => ({
        getSkyLight: (p) => {
          assert.deepEqual(p, { x: 15, y: 65, z: 15 });
          return 9;
        },
      }),
    },
  };
  assert.equal(eyeSkyLight(bot), 9);
  bot.world.getColumn = () => ({ getSkyLight: () => 0 });
  assert.equal(eyeSkyLight(bot), 0);
  bot.world.getColumn = () => null;
  assert.equal(eyeSkyLight(bot), null);
});
test('sky presentation reads loaded column roofs, dimensions and missing data', () => {
  let reads = 0;
  const column = {
    minY: -64,
    worldHeight: 384,
    getBlock: ({ y }) => {
      reads++;
      return { transparent: y !== 80, shapes: [[0, 0, 0, 1, 1, 1]] };
    },
  };
  const bot = {
    game: { dimension: 'overworld' },
    entity: { position: { x: -1, y: 60, z: -1 } },
    world: {
      getColumn: (x, z) => {
        assert.equal(x, -1);
        assert.equal(z, -1);
        return column;
      },
    },
  };
  assert.equal(skyExposure(bot), false);
  assert.ok(reads < 384);
  column.getBlock = () => ({ transparent: true, shapes: [] });
  assert.equal(skyExposure(bot), true);
  bot.game.dimension = 'the_nether';
  assert.equal(skyExposure(bot), false);
  bot.game.dimension = 'overworld';
  bot.world.getColumn = () => null;
  assert.equal(skyExposure(bot), null);
});
test('fish variant uses the pinned registry key and bounds packed metadata', () => {
  const registry = {
    entitiesByName: {
      tropical_fish: { metadataKeys: ['flags', 'type_variant'] },
    },
  };
  assert.equal(
    fishVariant({ name: 'tropical_fish', metadata: [0, 0x04030101] }, registry),
    0x04030101,
  );
  for (const value of [-1, NaN, 2 ** 32, 1.1])
    assert.equal(
      fishVariant({ name: 'tropical_fish', metadata: [0, value] }, registry),
      null,
    );
  assert.equal(fishVariant({ name: 'cod' }, registry), null);
});
