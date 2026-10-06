import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { BridgeError, PROTOCOL_VERSION, minecraftName } from './input.js';
import { VirtualPlayer } from './session.js';

export function createGateway({
  token,
  minecraft,
  createBot,
  maxSessions = 16,
  spawnTimeoutMs = 15000,
  log = () => {},
}) {
  if (
    typeof token !== 'string' ||
    token.length < 32 ||
    token.startsWith('replace-')
  )
    throw new Error(
      'BRIDGE_TOKEN must be a unique secret of at least 32 characters',
    );
  if (!['127.0.0.1', '::1', 'localhost'].includes(minecraft.host))
    throw new Error('Offline development Minecraft target must be loopback');
  const sessions = new Map();
  const identities = new Set();
  let shuttingDown = false;
  // One authenticated Roblox server per gateway in v1. Fixed window bounds the
  // total service load; a production gateway needs per-server/account quotas.
  let windowStart = performance.now();
  let requests = 0;
  const expected = Buffer.from(`Bearer ${token}`);
  const server = http.createServer(async (req, res) => {
    const started = performance.now();
    const respond = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const auth = Buffer.from(req.headers.authorization ?? '');
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected))
        throw new BridgeError('Unauthorized', 401);
      if (shuttingDown) throw new BridgeError('Gateway is shutting down', 503);
      if (started - windowStart >= 60000) {
        windowStart = started;
        requests = 0;
      }
      if (++requests > 1200)
        throw new BridgeError('Request rate exceeded', 429);
      if (req.url === '/health' && req.method === 'GET') {
        respond(200, { version: PROTOCOL_VERSION, sessions: sessions.size });
        return;
      }
      let body;
      if (['POST', 'PUT'].includes(req.method)) body = await readJson(req);
      if (body && body.version !== PROTOCOL_VERSION)
        throw new BridgeError('Unsupported protocol version', 426);
      if (req.url === '/v1/sessions' && req.method === 'POST') {
        minecraftName(body.robloxId);
        if (Object.keys(body).some((k) => !['version', 'robloxId'].includes(k)))
          throw new BridgeError('Unknown session field');
        if (identities.has(body.robloxId))
          throw new BridgeError('Identity already connected', 409);
        if (sessions.size >= maxSessions)
          throw new BridgeError('Session limit reached', 429);
        const player = new VirtualPlayer({
          robloxId: body.robloxId,
          createBot,
          minecraft,
          log,
        });
        identities.add(player.robloxId);
        sessions.set(player.id, player);
        player.once('closed', () => {
          sessions.delete(player.id);
          identities.delete(player.robloxId);
        });
        await player.ready(spawnTimeoutMs);
        respond(201, player.snapshot());
        return;
      }
      if (req.url === '/v1/exchange' && req.method === 'POST') {
        if (
          Object.keys(body).some((k) => !['version', 'inputs'].includes(k)) ||
          !Array.isArray(body.inputs) ||
          body.inputs.length > maxSessions
        )
          throw new BridgeError('Invalid exchange batch');
        const results = body.inputs.map((input) => {
          try {
            if (
              !input ||
              Object.keys(input).some((k) => !['id', 'frame'].includes(k))
            )
              throw new BridgeError('Invalid exchange input');
            const player = sessions.get(input.id);
            if (!player) throw new BridgeError('Unknown session', 404);
            const ack = player.apply(input.frame);
            return { ...player.snapshot(), ...ack };
          } catch (error) {
            return {
              id: input?.id,
              error:
                error instanceof BridgeError ? error.message : 'Internal error',
              status: error.status ?? 500,
            };
          }
        });
        respond(200, { version: PROTOCOL_VERSION, states: results });
        return;
      }
      const match =
        /^\/v1\/sessions\/([0-9a-f-]{36})(?:\/(input|state))?$/.exec(req.url);
      const player = match && sessions.get(match[1]);
      if (!player) throw new BridgeError('Not found', 404);
      if (match[2] === 'input' && req.method === 'PUT') {
        const ack = player.apply(body);
        respond(200, { ...player.snapshot(), ...ack });
      } else if (match[2] === 'state' && req.method === 'GET')
        respond(200, player.snapshot());
      else if (!match[2] && req.method === 'DELETE') {
        player.close();
        respond(200, { closed: true });
      } else throw new BridgeError('Not found', 404);
    } catch (error) {
      const status = error instanceof BridgeError ? error.status : 500;
      if (status === 500)
        log({ event: 'request_error', message: error.message });
      if (!res.headersSent && !res.destroyed)
        respond(status, {
          error: status === 500 ? 'Internal error' : error.message,
        });
    } finally {
      log({
        event: 'request',
        method: req.method,
        status: res.statusCode,
        processingMs: performance.now() - started,
      });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  const maintenance = setInterval(() => {
    for (const player of sessions.values()) player.maintain();
  }, 100);
  maintenance.unref();
  return {
    server,
    sessions,
    async close() {
      shuttingDown = true;
      clearInterval(maintenance);
      for (const player of sessions.values()) player.close('gateway shutdown');
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new BridgeError('Expected application/json', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new BridgeError('Request body too large', 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new BridgeError('Invalid JSON body');
  }
}
