import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { Actions, validateAction } from '../bridge/actions.js';
import { VirtualPlayer } from '../bridge/session.js';
import { fakeBot } from './helpers.js';
import minecraftData from 'minecraft-data';
const action = (kind, fields = {}) => ({ seq: 1, epoch: 1, kind, ...fields });
test('distribution and collection are bounded vanilla intentions, not stack claims', () => {
  assert.doesNotThrow(() =>
    validateAction(
      action('distribute', { window: 0, slots: [9, 10, 11], button: 0 }),
    ),
  );
  for (const slots of [
    [9, 9],
    [],
    Array.from({ length: 55 }, (_, i) => i),
    [-999],
  ])
    assert.throws(() =>
      validateAction(action('distribute', { window: 0, slots, button: 0 })),
    );
  assert.throws(() =>
    validateAction(action('click', { window: 0, slot: 9, button: 1, mode: 6 })),
  );
});
test('unsupported library click modes are delegated to authoritative server packets', async (t) => {
  const { actions, bot } = setup(t);
  bot.registry = minecraftData('1.21.4');
  bot.supportFeature = () => true;
  const packets = [];
  bot._client.write = (name, packet) => {
    packets.push([name, packet]);
    queueMicrotask(() => bot.emit('setWindowItems:0'));
  };
  await actions.execute(
    action('distribute', { window: 0, slots: [9, 10, 11], button: 1 }),
  );
  assert.deepEqual(
    packets.map(([, p]) => [p.slot, p.mouseButton, p.mode]),
    [
      [-999, 4, 5],
      [9, 5, 5],
      [10, 5, 5],
      [11, 5, 5],
      [-999, 6, 5],
    ],
  );
  assert.ok(
    packets.every(([, p]) => p.stateId === -1 && p.changedSlots.length === 0),
  );
  await actions.execute(
    action('click', { window: 0, slot: 9, button: 0, mode: 6 }),
  );
  assert.equal(packets.at(-1)[1].mode, 6);
  await assert.rejects(
    actions.execute(
      action('click', { window: 0, slot: 9, button: 2, mode: 3 }),
    ),
    /Creative mode/,
  );
  assert.equal(bot.listenerCount('setWindowItems:0'), 0);
});
function setup(t) {
  const bot = fakeBot();
  bot.entity.position = new Vec3(0, 64, 0);
  bot.entity.eyeHeight = 1.62;
  const calls = [];
  bot.chat = (text) => calls.push(['chat', text]);
  bot.tabComplete = async () => [{ match: 'gamemode' }];
  bot.inventory = {
    id: 0,
    type: 'minecraft:inventory',
    slots: Array(46).fill(null),
    selectedItem: null,
  };
  bot.clickWindow = async (...args) => calls.push(['click', ...args]);
  bot.closeWindow = async (window) => calls.push(['close', window.id]);
  bot.blockAt = (p) => ({
    position: p.clone(),
    name: 'stone',
    diggable: true,
    type: 1,
  });
  bot.canDigBlock = () => true;
  bot.digTime = () => 1;
  bot.dig = async () => calls.push(['dig']);
  bot.stopDigging = () => {};
  bot.heldItem = { name: 'stone' };
  bot.placeBlock = async () => calls.push(['place']);
  bot.attack = (e) => calls.push(['attack', e.id]);
  const player = new VirtualPlayer({
    robloxId: '1',
    createBot: () => bot,
    minecraft: {},
  });
  bot.emit('spawn');
  t.after(() => player.close());
  return { player, bot, calls, actions: player.actions };
}
test('placement helpers serialize confirmation and preserve the movement look direction', async (t) => {
  const { actions, bot } = setup(t);
  const started = [],
    releases = [];
  bot._placeBlockWithOptions = async (block, face, options) => {
    started.push({ block, face, options });
    await new Promise((resolve) => releases.push(resolve));
  };
  const first = actions.submit(
    action('place', {
      target: [0, 64, 0],
      face: [0, 1, 0],
      hit: [0.5, 1, 0.5],
    }),
  );
  const second = actions.submit({
    ...action('place', {
      target: [0, 65, 0],
      face: [0, 1, 0],
      hit: [0.5, 1, 0.5],
    }),
    seq: 2,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.length, 1);
  assert.equal(started[0].options.forceLook, 'ignore');
  assert.deepEqual(started[0].options.delta, new Vec3(0.5, 1, 0.5));
  releases[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.status, 'sent');
  assert.equal(started.length, 2);
  releases[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.status, 'sent');
  assert.equal(actions.pending, 0);
});
test('discrete action parser rejects gameplay claims, invalid faces, windows and chat controls', () => {
  for (const a of [
    action('place', { target: [0, 64, 0], face: [1, 1, 0] }),
    action('click', { window: 0, slot: 999, button: 0, mode: 0 }),
    action('chat', { text: 'hello\n/op RB1' }),
    action('chat', { text: 'ok', position: [0, 0, 0] }),
    action('attack', { entity: -1 }),
    action('unknown'),
  ])
    assert.throws(() => validateAction(a));
  assert.equal(
    validateAction(action('chat', { text: '/gamemode creative' })).text,
    '/gamemode creative',
  );
});
test('chat and commands follow Minecraft chat path without granting permissions; actions deduplicate', async (t) => {
  const { actions, calls, player } = setup(t);
  const a = action('chat', { text: '/gamemode creative' });
  const record = actions.submit(a);
  assert.equal(actions.submit(a), record);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, [['chat', '/gamemode creative']]);
  assert.equal(record.status, 'sent');
  player.bot.emit('messagestr', 'Unknown or incomplete command', 'system');
  assert.equal(
    player.snapshot().events.at(-1).data.text,
    'Unknown or incomplete command',
  );
  assert.throws(
    () => actions.submit({ ...a, seq: 2, epoch: 2 }),
    /Stale world/,
  );
});
test('inventory uses server window and slot checks; no client inventories are accepted', async (t) => {
  const { actions, calls, player } = setup(t);
  player.bot.inventory.slots[36] = {
    name: 'stone',
    count: 12,
    type: 1,
    slot: 36,
  };
  actions.submit(action('click', { window: 0, slot: 36, button: 1, mode: 0 }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, [['click', 36, 1, 0]]);
  const bad = actions.submit(
    action('click', { seq: 2, window: 1, slot: 36, button: 0, mode: 0 }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(bad.status, 'rejected');
  assert.match(bad.error, /Window changed/);
  assert.equal(player.snapshot().inventory.slots[0], false);
  assert.equal(player.snapshot().inventory.slots[36].count, 12);
});
test('block/entity reach and occlusion reject forged targets; failures are observable', async (t) => {
  const { actions, calls, bot } = setup(t);
  let r = actions.submit(action('dig', { target: [100, 64, 0] }));
  await new Promise((done) => setImmediate(done));
  assert.equal(r.status, 'rejected');
  assert.equal(calls.length, 0);
  bot.world = { raycast: () => ({ position: new Vec3(0, 64, 1) }) };
  r = actions.submit(
    action('place', { seq: 2, target: [0, 64, 2], face: [0, 1, 0] }),
  );
  await new Promise((done) => setImmediate(done));
  assert.match(r.error, /occluded/);
  bot.entities = { 99: { id: 99, position: new Vec3(30, 64, 0) } };
  r = actions.submit(action('attack', { seq: 3, entity: 99 }));
  await new Promise((done) => setImmediate(done));
  assert.match(r.error, /outside reach/);
  bot.entities[99] = { id: 99, name: 'item', position: new Vec3(0, 64, 1) };
  r = actions.submit(action('attack', { seq: 4, entity: 99 }));
  await new Promise((done) => setImmediate(done));
  assert.match(r.error, /does not accept interaction/);
  assert.ok(!calls.some((call) => call[0] === 'attack'));
});
test('bounded action queue rejects floods and stale sequences', () => {
  const player = { bot: {}, worldEpoch: 1, status: 'ready' };
  const actions = new Actions(player);
  actions.execute = () => new Promise(() => {});
  for (let seq = 1; seq <= 4; seq++) actions.submit(action('useItem', { seq }));
  assert.throws(
    () => actions.submit(action('useItem', { seq: 5 })),
    /queue full/,
  );
});

test('creative inventory is bounded and gated by the Minecraft game mode', async (t) => {
  const { actions, bot } = setup(t);
  bot.registry = minecraftData('1.21.4');
  bot.game.gameMode = 'survival';
  let result = actions.submit(
    action('creative', { name: 'stone', count: 64, slot: 36 }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(result.status, 'rejected');
  assert.match(result.error, /Creative mode required/);
  bot.game.gameMode = 'creative';
  const writes = [];
  bot.creative = {
    setInventorySlot: async (slot, item) =>
      writes.push({ slot, name: item.name, count: item.count }),
  };
  result = actions.submit(
    action('creative', { seq: 2, name: 'stone', count: 64, slot: 36 }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(result.status, 'sent');
  assert.deepEqual(writes, [{ slot: 36, name: 'stone', count: 64 }]);
  result = actions.submit(
    action('creative', {
      seq: 3,
      name: 'diamond_pickaxe',
      count: 64,
      slot: 36,
    }),
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(result.status, 'rejected');
  assert.equal(writes.length, 1);
  result = actions.submit(action('catalog', { seq: 4, query: 'planks' }));
  await new Promise((r) => setImmediate(r));
  assert.ok(result.result.items.length <= 64);
  assert.ok(result.result.items.every((item) => item.name.includes('planks')));
  for (const fields of [{ slot: 9 }, { name: 'stone;op' }, { count: 65 }])
    assert.throws(() =>
      validateAction(
        action('creative', { name: 'stone', count: 1, slot: 36, ...fields }),
      ),
    );
});

test('respawn is explicit, deduplicated and rejected while alive', async (t) => {
  const { actions, bot } = setup(t);
  let count = 0;
  bot.respawn = () => {
    count++;
  };
  const rejected = actions.submit(action('respawn'));
  await new Promise((r) => setImmediate(r));
  assert.equal(rejected.status, 'rejected');
  assert.equal(count, 0);
  bot.health = 0;
  const request = action('respawn', { seq: 2 });
  const result = actions.submit(request);
  assert.equal(actions.submit(request), result);
  await new Promise((r) => setImmediate(r));
  assert.equal(result.status, 'sent');
  assert.equal(count, 1);
});

test('rapid inventory clicks preserve order and closing player inventory uses the real close packet path', async (t) => {
  const { actions, bot, calls } = setup(t);
  let release;
  bot.clickWindow = async (slot) => {
    calls.push(['click', slot]);
    if (slot === 36)
      await new Promise((r) => {
        release = r;
      });
  };
  actions.submit(action('click', { window: 0, slot: 36, button: 0, mode: 0 }));
  actions.submit(
    action('click', { seq: 2, window: 0, slot: 9, button: 0, mode: 0 }),
  );
  actions.submit(action('closeWindow', { seq: 3, window: 0 }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, [['click', 36]]);
  release();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, [
    ['click', 36],
    ['click', 9],
    ['close', 0],
  ]);
});

test('validated surface hits avoid raycasting at the wrong block centre', async (t) => {
  const { actions, bot, calls } = setup(t);
  let direction;
  bot.world = {
    raycast: (_eye, d) => {
      direction = d;
      return { position: new Vec3(0, 64, 1) };
    },
  };
  actions.submit(
    action('place', { target: [0, 64, 1], hit: [0.5, 1, 1], face: [0, 1, 0] }),
  );
  await new Promise((r) => setImmediate(r));
  assert.ok(direction.y > -0.35 && direction.y < 0);
  assert.deepEqual(calls, [['place']]);
  assert.throws(
    () =>
      validateAction(
        action('dig', { target: [0, 64, 1], hit: [0, Infinity, 1] }),
      ),
    /Invalid block hit/,
  );
});
