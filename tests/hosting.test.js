import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hostingPlan,
  provisionCloudflare,
  cloudflareRequest,
} from '../tools/hosting.js';
const account = 'a'.repeat(32),
  zone = 'b'.repeat(32),
  tunnelId = '12345678-1234-1234-1234-123456789abc';
const plan = hostingPlan(
  'https://bridge.example.com',
  'http://127.0.0.1:51111',
  { account, zone },
);
test('hosting plans reject credential URLs, non-loopback origins, Minecraft port and invalid Cloudflare IDs', () => {
  for (const origin of [
    'http://0.0.0.0:8080',
    'http://127.0.0.1:25565',
    'http://secret@127.0.0.1:8080',
    'https://127.0.0.1:8080',
  ])
    assert.throws(() => hostingPlan(plan.url, origin));
  assert.throws(() => hostingPlan('https://secret@example.com', plan.origin));
  assert.throws(() =>
    hostingPlan(plan.url, plan.origin, { account: '../account' }),
  );
});
test('Cloudflare setup checks zone ownership and existing DNS before creating a bounded tunnel route', async () => {
  const calls = [];
  let checkpoint;
  const request = async (route, method = 'GET', body) => {
    calls.push({ route, method, body });
    if (route === `/zones/${zone}`)
      return { name: 'example.com', account: { id: account } };
    if (route.includes('dns_records?')) return [];
    if (method === 'POST' && route.endsWith('cfd_tunnel'))
      return { id: tunnelId };
    if (route.endsWith('/token')) return 'connector-token-123456789';
    return {};
  };
  const result = await provisionCloudflare(plan, request, {
    checkpoint: async (value) => {
      checkpoint = value;
    },
  });
  assert.equal(result.tunnelId, tunnelId);
  assert.equal(checkpoint.tunnelId, tunnelId);
  assert.equal(
    calls.find((c) => c.method === 'PUT').body.config.ingress[0].service,
    plan.origin,
  );
  assert.deepEqual(
    calls.find((c) => c.method === 'PUT').body.config.ingress[1],
    { service: 'http_status:404' },
  );
  assert.equal(
    calls.find((c) => c.method === 'POST' && c.route.endsWith('dns_records'))
      .body.content,
    `${tunnelId}.cfargotunnel.com`,
  );
  let writes = 0;
  await assert.rejects(
    provisionCloudflare(plan, async (route, method = 'GET') => {
      if (method !== 'GET') writes++;
      return route === `/zones/${zone}`
        ? { name: 'example.com', account: { id: account } }
        : [{ type: 'A', content: '192.0.2.1' }];
    }),
    /already has DNS/,
  );
  assert.equal(writes, 0);
  await assert.rejects(
    provisionCloudflare(plan, async () => ({
      name: 'unrelated.example',
      account: { id: account },
    })),
    /Hostname must belong/,
  );
});
test('resuming a saved Cloudflare tunnel reuses its route without creating another tunnel or DNS record', async () => {
  const calls = [];
  await provisionCloudflare(
    plan,
    async (route, method = 'GET') => {
      calls.push(method);
      if (route === `/zones/${zone}`)
        return { name: 'example.com', account: { id: account } };
      if (route.includes('dns_records?'))
        return [
          {
            type: 'CNAME',
            content: `${tunnelId}.cfargotunnel.com`,
            proxied: true,
          },
        ];
      if (route.endsWith(tunnelId))
        return { name: plan.name, config_src: 'cloudflare' };
      if (route.endsWith('/token')) return 'connector-token-123456789';
      return {};
    },
    { existing: { account, zone, url: plan.url, tunnelId } },
  );
  assert.equal(calls.includes('POST'), false);
});
test('Cloudflare API credentials go only to the fixed official origin and failures omit provider body/secrets', async () => {
  const token = 'secret-token-1234567890';
  let seen;
  const fetcher = async (url, options) => {
    seen = { url, options };
    return new Response(
      JSON.stringify({ success: false, errors: [{ message: token }] }),
      { status: 403 },
    );
  };
  await assert.rejects(
    cloudflareRequest(token, `/zones/${zone}`, 'GET', undefined, fetcher),
    (error) => {
      assert.equal(error.message.includes(token), false);
      return true;
    },
  );
  assert.equal(seen.url, `https://api.cloudflare.com/client/v4/zones/${zone}`);
  assert.equal(seen.options.redirect, 'error');
  assert.equal(seen.options.headers.Authorization, `Bearer ${token}`);
  await assert.rejects(
    cloudflareRequest(
      token,
      'https://evil.example',
      undefined,
      undefined,
      fetcher,
    ),
  );
});
