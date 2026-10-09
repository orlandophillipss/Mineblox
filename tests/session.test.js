import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualPlayer } from '../bridge/session.js';
import { validateInput, minecraftName } from '../bridge/input.js';
import { fakeBot } from './helpers.js';
import { Vec3 } from 'vec3';

const frame = { version: 1, seq: 1, controls: 33, yaw: 0.5, pitch: 0.1 };
test('dead login requires real health and position, then preserves explicit respawn', async () => {
  for (const order of [
    ['health', 'forcedMove'],
    ['forcedMove', 'health'],
  ]) {
    const bot = fakeBot();
    bot.health = 0;
    let respawns = 0;
    bot.respawn = () => respawns++;
    const player = new VirtualPlayer({
      robloxId: '123',
      createBot: () => bot,
      minecraft: {},
    });
    bot.emit(order[0]);
    assert.equal(player.status, 'connecting');
    bot.emit(order[1]);
    await player.ready(100);
    assert.equal(player.snapshot().health, 0);
    assert.equal(player.worldEpoch, 1);
    assert.equal(respawns, 0);
    bot.emit('health');
    assert.equal(player.worldEpoch, 1);
    bot.health = 20;
    bot.emit('spawn');
    assert.equal(player.worldEpoch, 2);
    player.close();
  }
});

test('dead-looking defaults and an alive health packet cannot bypass spawn readiness', () => {
  const bot = fakeBot();
  const player = new VirtualPlayer({
    robloxId: '123',
    createBot: () => bot,
    minecraft: {},
  });
  bot.health = 0;
  bot.emit('forcedMove');
  assert.equal(player.status, 'connecting');
  bot.health = 20;
  bot.emit('health');
  assert.equal(player.status, 'connecting');
  bot.emit('spawn');
  assert.equal(player.status, 'ready');
  player.close();
});

test('virtual player disables automatic respawn and preserves bounded sound coordinates', () => {
  const bot = fakeBot();
  let options;
  const player = new VirtualPlayer({
    robloxId: '123',
    minecraft: {},
    createBot: (value) => {
      options = value;
      return bot;
    },
  });
  assert.equal(options.respawn, false);
  bot.emit(
    'soundEffectHeard',
    'minecraft:block.wooden_button.click_on',
    new Vec3(1, 2, 3),
    2,
    0.8,
  );
  assert.deepEqual(player.events.at(-1).data, {
    name: 'block.wooden_button.click_on',
    position: { x: 1, y: 2, z: 3 },
    volume: 2,
    pitch: 0.8,
  });
  player.close();
});
function setup() {
  let time = 0;
  const bot = fakeBot();
  const player = new VirtualPlayer({
    robloxId: '123',
    createBot: () => bot,
    minecraft: {},
    now: () => time,
  });
  bot.emit('spawn');
  return {
    bot,
    player,
    advance: (ms) => {
      time += ms;
    },
  };
}

test('intent frames cannot inject positions, gameplay outcomes, or incompatible versions', () => {
  for (const change of [
    { position: { x: 900 } },
    { damage: 20 },
    { inventory: [] },
    { version: 2 },
    { seq: 0 },
    { seq: 1.2 },
    { controls: 128 },
    { yaw: NaN },
    { pitch: Math.PI },
    { slot: -1 },
    { slot: 9 },
    { slot: NaN },
  ])
    assert.throws(() => validateInput({ ...frame, ...change }));
  for (const id of ['0', '../evil', 'abc', '123456789012345', 123])
    assert.throws(() => minecraftName(id));
  assert.equal(minecraftName('123'), 'RB123');
});

test('control input, accepted sequence, and server correction stay separate', () => {
  const { bot, player } = setup();
  assert.equal(player.apply(frame).acceptedSeq, 1);
  assert.equal(bot.controls.forward, true);
  assert.equal(bot.controls.sprint, true);
  assert.equal(bot.controls.back, false);
  assert.equal(player.snapshot().correction, null);
  assert.throws(() => player.apply(frame), /Stale/);
  bot.emit('forcedMove');
  assert.equal(player.snapshot().correction.revision, 1);
  assert.deepEqual(player.snapshot().correction.position, {
    x: 1,
    y: 64,
    z: -2,
  });
  bot.entity.position.x = 2;
  assert.equal(player.snapshot().correction.position.x, 1);
  bot._client.state = 'configuration';
  assert.throws(() => player.apply({ ...frame, seq: 2 }), /reconfiguring/);
  player.close();
});

test('Roblox usernames map within Minecraft limits and dropped stacks preserve item identity', () => {
  assert.equal(minecraftName('123', 'Real_Username'), 'Real_Username');
  const long = minecraftName('123', 'LongRobloxUsername20');
  assert.equal(long.length, 16);
  assert.notEqual(long, minecraftName('124', 'LongRobloxUsername20'));
  for (const name of ['ab', 'bad name', '../player', 'x'.repeat(21), 123])
    assert.throws(() => minecraftName('123', name));
  const { player, bot } = setup();
  bot.entities = {
    10: {
      id: 10,
      name: 'item',
      type: 'other',
      position: new Vec3(1, 64, -2),
      getDroppedItem: () => ({ name: 'oak_log', count: 3 }),
    },
  };
  assert.deepEqual(player.snapshot().entities[0].item, {
    name: 'oak_log',
    count: 3,
  });
  player.close();
});

test('hotbar selection changes only the held slot and is reflected in Minecraft state', () => {
  const { bot, player } = setup();
  player.apply({ ...frame, slot: 8 });
  assert.equal(bot.quickBarSlot, 8);
  assert.equal(player.snapshot().selectedSlot, 8);
  assert.equal(player.snapshot().hotbar.length, 9);
  player.close();
});

test('lost inputs stop movement and disconnected Roblox sessions expire', () => {
  const { bot, player, advance } = setup();
  player.apply(frame);
  advance(750);
  player.maintain();
  assert.deepEqual(bot.controls, {});
  advance(30000);
  player.maintain();
  assert.equal(player.status, 'closed');
  assert.equal(bot.quitCount, 1);
  player.close();
  assert.equal(bot.quitCount, 1);
});

test('spawn failure/timeout closes the Minecraft connection and removes listeners', async () => {
  const bot = fakeBot();
  const player = new VirtualPlayer({
    robloxId: '1',
    createBot: () => bot,
    minecraft: {},
  });
  await assert.rejects(player.ready(5), /timeout/);
  assert.equal(bot.quitCount, 1);
  assert.equal(player.listenerCount('ready'), 0);
  const bot2 = fakeBot();
  const player2 = new VirtualPlayer({
    robloxId: '2',
    createBot: () => bot2,
    minecraft: {},
  });
  const promise = player2.ready();
  bot2.emit('error', new Error('connection refused'));
  await assert.rejects(promise, /connection refused/);
  assert.equal(player2.status, 'closed');
});

test('per-player rate cap bounds input floods and refills over time', () => {
  const { player, advance } = setup();
  for (let seq = 1; seq <= 20; seq++) player.apply({ ...frame, seq });
  assert.throws(() => player.apply({ ...frame, seq: 21 }), /rate exceeded/);
  advance(50);
  assert.equal(player.apply({ ...frame, seq: 21 }).acceptedSeq, 21);
  player.close();
  player.bot.emit('spawn');
  assert.equal(player.status, 'closed');
});
