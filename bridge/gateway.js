import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { BridgeError, PROTOCOL_VERSION, minecraftName } from './input.js';
import { VirtualPlayer } from './session.js';
import { TerrainService } from './terrain.js';

export function createGateway({
  token,
  minecraft,
  createBot,
  maxSessions = 16,
  spawnTimeoutMs = 15000,
  log = () => {},
  models = {},
  terrainRadius = 2,
  requireOwner = false,
  maxServers = 4,
  maxSessionsPerServer = 16,
  content = () => null,
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
  const owners = new Map();
  const sessionOwners = new Map();
  const terrain = new TerrainService({ models, radius: terrainRadius });
  let terrainBusy = false;
  const identities = new Set();
  let shuttingDown = false;
  // Bound total authenticated load, with additional owner quotas in deployment
  // mode. These limits are not a measured concurrent-player capacity claim.
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
      let owner = 'local';
      if (requireOwner) {
        owner = req.headers['x-mineblox-server'];
        if (typeof owner !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(owner))
          throw new BridgeError(
            'A valid Roblox server ownership header is required',
            403,
          );
        let entry = owners.get(owner);
        if (!entry) {
          if (owners.size >= maxServers)
            throw new BridgeError('Game server limit reached', 429);
          entry = { window: started, requests: 0, lastSeen: started };
          owners.set(owner, entry);
        }
        if (started - entry.window >= 60000) {
          entry.window = started;
          entry.requests = 0;
        }
        if (++entry.requests > 600)
          throw new BridgeError('Game server request quota exceeded', 429);
        entry.lastSeen = started;
      }
      const ownedPlayer = (id) => {
        const player = sessions.get(id);
        if (!player || (requireOwner && sessionOwners.get(id) !== owner))
          throw new BridgeError('Unknown session', 404);
        return player;
      };
      if (req.url === '/v1/content' && req.method === 'GET') {
        respond(200, { version: 1, content: content() });
        return;
      }
      let body;
      if (['POST', 'PUT'].includes(req.method)) body = await readJson(req);
      if (body && body.version !== PROTOCOL_VERSION)
        throw new BridgeError('Unsupported protocol version', 426);
      if (req.url === '/v1/terrain' && req.method === 'POST') {
        if (
          Object.keys(body).some((k) => !['version', 'players'].includes(k)) ||
          !Array.isArray(body.players) ||
          body.players.length > 4
        )
          throw new BridgeError('Invalid terrain batch');
        if (terrainBusy) throw new BridgeError('Terrain exchange is busy', 429);
        terrainBusy = true;
        try {
          const worlds = [];
          for (const request of body.players) {
            if (
              !request ||
              Object.keys(request).some(
                (k) => !['id', 'known', 'epoch', 'format'].includes(k),
              )
            )
              throw new BridgeError('Invalid terrain player');
            const player = ownedPlayer(request.id);
            worlds.push(await terrain.stream(player, request));
          }
          respond(200, { version: 1, worlds });
        } finally {
          terrainBusy = false;
        }
        return;
      }
      if (req.url === '/v1/sessions' && req.method === 'POST') {
        const name = minecraftName(body.robloxId, body.username);
        if (
          body.displayName !== undefined &&
          (typeof body.displayName !== 'string' ||
            body.displayName.length > 64 ||
            [...body.displayName].some(
              (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
            ))
        )
          throw new BridgeError('Invalid display name');
        if (
          Object.keys(body).some(
            (k) =>
              !['version', 'robloxId', 'username', 'displayName'].includes(k),
          )
        )
          throw new BridgeError('Unknown session field');
        if (identities.has(body.robloxId))
          throw new BridgeError('Identity already connected', 409);
        if (
          [...sessions.values()].some(
            (p) => p.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw new BridgeError('Minecraft name already connected', 409);
        if (sessions.size >= maxSessions)
          throw new BridgeError('Session limit reached', 429);
        if (
          requireOwner &&
          [...sessionOwners.values()].filter((id) => id === owner).length >=
            maxSessionsPerServer
        )
          throw new BridgeError('Game server session quota exceeded', 429);
        const player = new VirtualPlayer({
          robloxId: body.robloxId,
          username: body.username,
          displayName: body.displayName,
          createBot,
          minecraft,
          log,
        });
        identities.add(player.robloxId);
        sessions.set(player.id, player);
        sessionOwners.set(player.id, owner);
        player.once('closed', () => {
          sessions.delete(player.id);
          identities.delete(player.robloxId);
          sessionOwners.delete(player.id);
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
              Object.keys(input).some(
                (k) => !['id', 'frame', 'actions'].includes(k),
              )
            )
              throw new BridgeError('Invalid exchange input');
            const player = ownedPlayer(input.id);
            const ack = player.apply(input.frame);
            if (input.actions !== undefined) {
              if (!Array.isArray(input.actions) || input.actions.length > 4)
                throw new BridgeError('Invalid actions');
              for (const action of input.actions) {
                try {
                  player.actions.submit(action);
                } catch (error) {
                  player.event('actionRejected', {
                    seq: action?.seq,
                    error: error.message,
                  });
                }
              }
            }
            return {
              ...player.snapshot(),
              ...ack,
              roster: [...sessions.values()].map((p) => ({
                minecraftName: p.name,
                username: p.username,
                displayName: p.displayName,
              })),
            };
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
      if (!match) throw new BridgeError('Not found', 404);
      const player = ownedPlayer(match[1]);
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
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  const maintenance = setInterval(() => {
    for (const player of sessions.values()) player.maintain();
    for (const [id, owner] of owners)
      if (
        performance.now() - owner.lastSeen > 60000 &&
        ![...sessionOwners.values()].includes(id)
      )
        owners.delete(id);
  }, 100);
  maintenance.unref();
  return {
    server,
    sessions,
    async close() {
      shuttingDown = true;
      clearInterval(maintenance);
      for (const player of sessions.values()) player.close('gateway shutdown');
      await terrain.close();
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
