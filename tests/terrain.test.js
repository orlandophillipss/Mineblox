import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import {
  TerrainService,
  partitionKey,
  interestKeys,
  surfaceHeights,
} from '../bridge/terrain.js';
test('high players keep loaded ground surface bands without scanning voxels or requesting camera terrain', () => {
  let columns = 0;
  const heights = surfaceHeights(
    {
      getColumn: () => {
        columns++;
        return {
          minY: -64,
          sections: [
            { solidBlockCount: 4096 },
            { solidBlockCount: 20 },
            { solidBlockCount: 0 },
          ],
        };
      },
    },
    { x: -0.5, y: 80, z: -0.5 },
    4,
  );
  const keys = interestKeys(
    { x: -0.5, y: 80, z: -0.5 },
    { radius: 4, surfaceHeights: heights },
  );
  assert.ok(keys.includes('-1,-6,-1'));
  assert.ok(keys.length <= 486);
  assert.ok(columns <= 25);
  assert.equal(new Set(keys).size, keys.length);
  const ground = interestKeys(
    { x: 0, y: -40, z: 0 },
    { radius: 4, surfaceHeights: heights },
  );
  assert.equal(
    ground.length,
    243,
    'ordinary grounded interest stays at its existing bound',
  );
});
import { VirtualPlayer } from '../bridge/session.js';
import { fakeBot } from './helpers.js';

test('the real terrain worker meshes water and lava levels and culls boundary neighbors', async (t) => {
  const terrain = new TerrainService();
  t.after(() => terrain.close());
  for (const name of ['water', 'lava']) {
    for (const [level, height] of [
      [0, 8 / 9],
      [7, 1 / 9],
      [8, 8 / 9],
    ]) {
      const data = new Uint32Array(512);
      data[448] = 1;
      const palette = [
        { state: 1, name, cube: false, shapes: [], properties: { level } },
        { state: 2, name: 'stone', cube: true, opaque: true },
      ];
      const quads = await terrain.mesh({ origin: [-8, 64, 0], data, palette });
      assert.equal(quads.length, 6);
      assert.ok(quads.every((q) => q[7] === 1 && q.every(Number.isFinite)));
      assert.equal(quads.find((q) => q[0] === 1 && q[1] === 1)[3], 71 + height);
      const culled = await terrain.mesh({
        origin: [-8, 64, 0],
        data,
        palette,
        neighbors: { '-9,71,0': 1, '-8,71,-1': 2, '-8,72,0': 1 },
      });
      assert.equal(culled.length, 3);
      assert.ok(
        !culled.some(
          (q) =>
            (q[0] === 1 && q[1] === 1) ||
            (q[0] === 0 && q[1] === -1) ||
            (q[0] === 2 && q[1] === -1),
        ),
      );
      assert.equal(
        culled.find((q) => q[0] === 0)[6],
        1,
        'fluid above fills the side height',
      );
    }
  }
});

test('leaf state variants omit coincident interior faces without merging distinct state materials', async (t) => {
  const terrain = new TerrainService();
  t.after(() => terrain.close());
  const palette = [1, 2].map((state) => ({
    state,
    name: 'oak_leaves',
    cube: true,
    opaque: false,
    properties: { distance: state, persistent: state === 2 },
  }));
  const data = new Uint32Array(512);
  data[0] = 1;
  data[1] = 2;
  const quads = await terrain.mesh({ origin: [-8, 64, 0], data, palette });
  assert.equal(
    quads.reduce((area, q) => area + q[5] * q[6], 0),
    10,
  );
  assert.ok(
    !quads.some((q) => q[0] === 0 && q[2] === -7),
    'shared plane has no duplicate faces',
  );
  assert.deepEqual(
    new Set(quads.map((q) => q[7])),
    new Set([1, 2]),
    'render keys remain state-local',
  );
  data[1] = 0;
  const boundary = await terrain.mesh({
    origin: [-8, 64, 0],
    data,
    palette,
    neighbors: { '-9,64,0': 2 },
  });
  assert.equal(boundary.length, 5);
  assert.ok(
    !boundary.some((q) => q[0] === 0 && q[1] === -1),
    'neighbor partition uses the same occlusion family',
  );
});

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
test('stream extraction includes transparent cube neighbors so leaf partition seams are culled', async (t) => {
  const { terrain, player, bot } = setup(t);
  bot.blockAt = (p) => {
    const leaf = p.y === 63 && p.z === 0 && p.x >= 0 && p.x < 16;
    return {
      stateId: leaf ? (p.x < 8 ? 1 : 2) : 0,
      name: leaf ? 'oak_leaves' : 'air',
      transparent: true,
      shapes: leaf ? [[0, 0, 0, 1, 1, 1]] : [],
      getProperties: () => ({ distance: p.x < 8 ? 1 : 2 }),
    };
  };
  const state = terrain.state(player);
  const left = await terrain.partition(player, state, '0,7,0');
  const right = await terrain.partition(player, state, '1,7,0');
  for (const part of [left, right]) {
    assert.ok(!part.quads.some((q) => q[0] === 0 && q[2] === 8));
    assert.ok(
      part.voxels.some((voxel) => voxel !== 0),
      'canonical leaves remain present',
    );
  }
  assert.ok(left.quads.some((q) => q[0] === 0 && q[2] === 0));
  assert.ok(right.quads.some((q) => q[0] === 0 && q[2] === 16));
});

test('interest is bounded and floor-correct across negative partition boundaries', () => {
  assert.equal(partitionKey({ x: -0.01, y: -64, z: -8.1 }), '-1,-8,-2');
  const keys = interestKeys({ x: 0, y: 64, z: 0 });
  assert.equal(keys.length, 75);
  assert.equal(new Set(keys).size, 75);
  assert.equal(keys[0], '0,8,0');
});
test('terrain format negotiation preserves legacy clients and bounds adaptive snapshots', async (t) => {
  const { terrain, player } = setup(t);
  const legacy = await terrain.stream(player);
  const compact = await terrain.stream(player, {
    format: 'state-adaptive-xzy-v2',
  });
  assert.equal(compact.voxelFormat, 'state-adaptive-xzy-v2');
  assert.deepEqual(
    compact.partitions.map((p) => p.key),
    legacy.partitions.map((p) => p.key),
  );
  assert.ok(
    compact.partitions.every(
      (p) => p.voxels === undefined && p.voxelData.encoding === 'uniform',
    ),
  );
  assert.ok(JSON.stringify(compact).length < JSON.stringify(legacy).length / 2);
  await assert.rejects(
    terrain.stream(player, { format: 'bogus' }),
    /Unsupported/,
  );
});
test('stream revisions recover lost snapshots, invalidate block edits and reset dimension epochs', async (t) => {
  const { player, bot, terrain, change } = setup(t);
  const first = await terrain.stream(player);
  assert.equal(first.partitions.length, 16);
  assert.ok(first.partitions.some((p) => p.quads.length === 1));
  const retry = await terrain.stream(player);
  assert.deepEqual(retry.partitions, first.partitions);
  const known = Object.fromEntries(
    first.partitions.map((p) => [p.key, p.revision]),
  );
  const next = await terrain.stream(player, { epoch: first.epoch, known });
  assert.equal(next.partitions.length, 16);
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
  assert.equal(respawn.partitions.length, 16);
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
  assert.equal(result.partitions.length, 16);
  assert.ok(!result.partitions.some((p) => p.key === '0,8,0'));
  for (let i = 0; i < 25; i++) {
    bot.entity.position.x += 8;
    await terrain.stream(player);
    assert.ok(terrain.state(player).cache.size <= 75);
  }
  player.close();
  assert.equal(terrain.players.size, 0);
});

test('a block change cancels only intersecting builds, while unrelated in-flight meshes survive', async (t) => {
  const { terrain, player, bot } = setup(t);
  const jobs = [];
  terrain.mesh = () => new Promise((resolve) => jobs.push(resolve));
  const state = terrain.state(player);
  const near = terrain.partition(player, state, '0,7,0');
  const far = terrain.partition(player, state, '2,7,0');
  bot.emit('blockUpdate', null, { position: new Vec3(1, 63, 1) });
  for (const resolve of jobs) resolve([]);
  assert.equal(await near, null);
  assert.ok(await far);
  assert.ok(!state.cache.has('0,7,0'));
  assert.ok(state.cache.has('2,7,0'));
  const old = terrain.partition(player, state, '1,7,0');
  bot.emit('spawn');
  terrain.state(player);
  jobs.at(-1)([]);
  assert.equal(await old, null, 'old epoch cannot populate the new cache');
});
