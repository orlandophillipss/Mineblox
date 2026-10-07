import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { Actions, validateAction } from '../bridge/actions.js';
import { VirtualPlayer } from '../bridge/session.js';
import { fakeBot } from './helpers.js';
const action = (kind, fields = {}) => ({ seq: 1, epoch: 1, kind, ...fields });
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
