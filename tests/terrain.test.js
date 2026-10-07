import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import {
  TerrainService,
  partitionKey,
  interestKeys,
} from '../bridge/terrain.js';
import { VirtualPlayer } from '../bridge/session.js';
import { fakeBot } from './helpers.js';

function setup(t) {
  const bot = fakeBot();
  bot.entity.position = new Vec3(0, 64, 0);
  let changed = false;
  bot.blockAt = (p) => {
    const solid =
      p.y < 64 && !(changed && p.x === 0 && p.y === 63 && p.z === 0);
    return {
      stateId: solid ? 1 : 0,
      name: solid ? 'stone' : 'air',
      transparent: !solid,
      shapes: solid ? [[0, 0, 0, 1, 1, 1]] : [],
    };
  };
  const player = new VirtualPlayer({
    robloxId: '1',
    createBot: () => bot,
    minecraft: {},
  });
  bot.emit('spawn');
  const terrain = new TerrainService();
  t.after(async () => {
    player.close();
    await terrain.close();
  });
  return {
    player,
    bot,
    terrain,
    change: () => {
      changed = true;
      bot.emit('blockUpdate', null, { position: new Vec3(0, 63, 0) });
    },
  };
}
test('interest is bounded and floor-correct across negative partition boundaries', () => {
  assert.equal(partitionKey({ x: -0.01, y: -64, z: -8.1 }), '-1,-8,-2');
  const keys = interestKeys({ x: 0, y: 64, z: 0 });
  assert.equal(keys.length, 75);
  assert.equal(new Set(keys).size, 75);
  assert.equal(keys[0], '0,8,0');
});
test('stream revisions recover lost snapshots, invalidate block edits and reset dimension epochs', async (t) => {
  const { player, bot, terrain, change } = setup(t);
  const first = await terrain.stream(player);
  assert.equal(first.partitions.length, 4);
  assert.ok(first.partitions.some((p) => p.quads.length === 1));
  const retry = await terrain.stream(player);
  assert.deepEqual(retry.partitions, first.partitions);
  const known = Object.fromEntries(
    first.partitions.map((p) => [p.key, p.revision]),
  );
  const next = await terrain.stream(player, { epoch: first.epoch, known });
  assert.equal(next.partitions.length, 4);
  assert.ok(next.partitions.every((p) => !known[p.key]));
  change();
  const changed = await terrain.stream(player, { epoch: first.epoch, known });
  const dirty = changed.partitions.find((p) => p.key === '0,7,0');
  assert.ok(dirty.revision > known[dirty.key]);
  assert.ok(
    dirty.quads.length >
      first.partitions.find((p) => p.key === dirty.key).quads.length,
  );
  assert.equal(dirty.voxels[8 * 8 * 7], 0);
  bot.game.dimension = 'the_nether';
  bot.emit('spawn');
  const respawn = await terrain.stream(player, { epoch: first.epoch, known });
  assert.equal(respawn.epoch, first.epoch + 1);
  assert.equal(respawn.dimension, 'the_nether');
  assert.equal(respawn.partitions.length, 4);
  await assert.rejects(
    terrain.stream(player, { known: { invalid: 1 } }),
    /revisions/,
  );
});
test('unloaded closest partitions do not starve loaded neighbors and cache stays bounded', async (t) => {
  const { player, bot, terrain } = setup(t);
  const original = bot.blockAt;
  bot.blockAt = (p) =>
    p.x >= 0 && p.x < 8 && p.y >= 64 && p.y < 72 && p.z >= 0 && p.z < 8
      ? null
      : original(p);
  const result = await terrain.stream(player);
  assert.equal(result.partitions.length, 4);
  assert.ok(!result.partitions.some((p) => p.key === '0,8,0'));
  for (let i = 0; i < 25; i++) {
    bot.entity.position.x += 8;
    await terrain.stream(player);
    assert.ok(terrain.state(player).cache.size <= 75);
  }
  player.close();
  assert.equal(terrain.players.size, 0);
});
