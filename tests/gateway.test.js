import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../bridge/gateway.js';
import { fakeBot } from './helpers.js';

const token = 'a'.repeat(32);
async function setup(
  t,
  factory = () => {
    const bot = fakeBot();
    setImmediate(() => bot.emit('spawn'));
    return bot;
  },
) {
  const gateway = createGateway({
    token,
    minecraft: { host: '127.0.0.1' },
    createBot: factory,
    maxSessions: 2,
    spawnTimeoutMs: 30,
  });
  await new Promise((resolve) =>
    gateway.server.listen(0, '127.0.0.1', resolve),
  );
  t.after(() => gateway.close());
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  const request = async (url, method = 'GET', body, auth = token) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { gateway, request, base };
}

test('authenticated session lifecycle, batched movement, version rejection, and cleanup', async (t) => {
  const { gateway, request } = await setup(t);
  assert.equal(
    (await request('/health', 'GET', undefined, 'wrong')).status,
    401,
  );
  assert.equal(
    (await request('/v1/sessions', 'POST', { version: 9, robloxId: '1' }))
      .status,
    426,
  );
  const first = await request('/v1/sessions', 'POST', {
    version: 1,
    robloxId: '1',
  });
  assert.equal(first.status, 201);
  assert.equal(
    (await request('/v1/sessions', 'POST', { version: 1, robloxId: '1' }))
      .status,
    409,
  );
  const second = await request('/v1/sessions', 'POST', {
    version: 1,
    robloxId: '2',
  });
  assert.equal(second.status, 201);
  assert.equal(
    (await request('/v1/sessions', 'POST', { version: 1, robloxId: '3' }))
      .status,
    429,
  );
  const frame = { version: 1, seq: 1, controls: 1, yaw: 0, pitch: 0 };
  const exchange = await request('/v1/exchange', 'POST', {
    version: 1,
    inputs: [
      { id: first.body.id, frame },
      { id: second.body.id, frame },
    ],
  });
  assert.equal(exchange.body.states.length, 2);
  assert.equal(exchange.body.states[0].acceptedSeq, 1);
  assert.equal(exchange.body.states[0].correction, null);
  const duplicate = await request(
    `/v1/sessions/${first.body.id}/input`,
    'PUT',
    frame,
  );
  assert.equal(duplicate.status, 409);
  assert.equal(
    (await request(`/v1/sessions/${first.body.id}`, 'DELETE')).status,
    200,
  );
  assert.equal(gateway.sessions.size, 1);
  gateway.sessions.get(second.body.id).bot.emit('end');
  assert.equal(gateway.sessions.size, 0);
});

test('malformed/oversized bodies and failed spawns do not leak sessions', async (t) => {
  const { request, base, gateway } = await setup(t, fakeBot);
  assert.equal(
    (await request('/v1/sessions', 'POST', { version: 1, robloxId: '1' }))
      .status,
    504,
  );
  assert.equal(gateway.sessions.size, 0);
  for (const body of [
    '{broken',
    JSON.stringify({ version: 1, padding: 'x'.repeat(17000) }),
  ]) {
    const r = await fetch(base + '/v1/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    assert.ok([400, 413].includes(r.status));
  }
  assert.throws(
    () => createGateway({ token, minecraft: { host: 'example.com' } }),
    /loopback/,
  );
  assert.throws(
    () => createGateway({ token: 'weak', minecraft: {} }),
    /secret/,
  );
});

test('duplicate identity cannot race during Minecraft login', async (t) => {
  const { request, gateway } = await setup(t, fakeBot);
  const a = request('/v1/sessions', 'POST', { version: 1, robloxId: '1' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const b = await request('/v1/sessions', 'POST', {
    version: 1,
    robloxId: '1',
  });
  assert.equal(b.status, 409);
  assert.equal((await a).status, 504);
  assert.equal(gateway.sessions.size, 0);
});

test('server supplied usernames and display names survive exchange; name collisions are rejected', async (t) => {
  const { request } = await setup(t);
  const first = await request('/v1/sessions', 'POST', {
    version: 1,
    robloxId: '1',
    username: 'RealUsername',
    displayName: 'Display Name',
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.minecraftName, 'RealUsername');
  assert.equal(
    (
      await request('/v1/sessions', 'POST', {
        version: 1,
        robloxId: '2',
        username: 'realusername',
      })
    ).status,
    409,
  );
  const exchange = await request('/v1/exchange', 'POST', {
    version: 1,
    inputs: [
      {
        id: first.body.id,
        frame: { version: 1, seq: 1, controls: 0, yaw: 0, pitch: 0 },
      },
    ],
  });
  assert.deepEqual(exchange.body.states[0].roster, [
    {
      minecraftName: 'RealUsername',
      username: 'RealUsername',
      displayName: 'Display Name',
    },
  ]);
  assert.equal(
    (
      await request('/v1/sessions', 'POST', {
        version: 1,
        robloxId: '2',
        displayName: 'bad\nname',
      })
    ).status,
    400,
  );
});
