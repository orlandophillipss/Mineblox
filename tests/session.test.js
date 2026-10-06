import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualPlayer } from '../bridge/session.js';
import { validateInput, minecraftName } from '../bridge/input.js';
import { fakeBot } from './helpers.js';

const frame = { version: 1, seq: 1, controls: 33, yaw: 0.5, pitch: 0.1 };
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
