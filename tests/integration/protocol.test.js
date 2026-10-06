import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import mc from 'minecraft-protocol';
import minecraftData from 'minecraft-data';
import prismarineChunk from 'prismarine-chunk';
import { Vec3 } from 'vec3';
import mineflayer from 'mineflayer';
import { VirtualPlayer } from '../../bridge/session.js';
import {
  extractRegion,
  encodeSnapshot,
  decodeSnapshot,
} from '../../bridge/voxels.js';

// A real TCP + configuration/login/chunk/movement protocol fixture, deliberately
// NOT a vanilla simulation. Real server authority is tested by test:live.
test(
  '1.21.4 protocol login, teleport confirmation, chunk decoding, movement, and disconnect',
  { timeout: 15000 },
  async (t) => {
    const md = minecraftData('1.21.4');
    const server = mc.createServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.21.4',
      'online-mode': false,
    });
    t.after(() => server.close());
    await once(server, 'listening');
    const errors = [];
    server.on('error', (error) => errors.push(error));
    const movements = [];
    let confirms = 0;
    let joinedName;
    server.on('playerJoin', (client) => {
      joinedName = client.username;
      client.on('error', (e) => errors.push(e));
      client.on('teleport_confirm', () => confirms++);
      for (const name of ['position', 'position_look'])
        client.on(name, (packet) => movements.push(packet));
      client.write('login', {
        ...md.loginPacket,
        entityId: 7,
        enforcesSecureChat: false,
      });
      const Chunk = prismarineChunk('1.21.4');
      const chunk = new Chunk();
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++)
          chunk.setBlockStateId(
            new Vec3(x, 63, z),
            md.blocksByName.stone.minStateId,
          );
      client.write('map_chunk', {
        x: 0,
        z: 0,
        heightmaps: { type: 'compound', value: {} },
        chunkData: chunk.dump(),
        blockEntities: [],
        ...chunk.dumpLight(),
      });
      client.write('position', {
        teleportId: 1,
        x: 8,
        y: 64,
        z: 8,
        dx: 0,
        dy: 0,
        dz: 0,
        yaw: 0,
        pitch: 0,
        flags: {},
      });
      client.write('update_health', {
        health: 20,
        food: 20,
        foodSaturation: 5,
      });
    });
    const player = new VirtualPlayer({
      robloxId: '123',
      createBot: mineflayer.createBot,
      minecraft: {
        host: '127.0.0.1',
        port: server.socketServer.address().port,
        version: '1.21.4',
      },
    });
    t.after(() => player.close());
    await player.ready();
    assert.equal(joinedName, 'RB123');
    const deadline = performance.now() + 3000;
    while (
      (!confirms || !player.lastCorrection) &&
      performance.now() < deadline
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(confirms > 0);
    assert.equal(player.snapshot().correction.position.y, 64);
    const region = extractRegion(player.bot, [7, 63, 7], [2, 2, 2]);
    assert.equal(region.get(0, 0, 0), md.blocksByName.stone.minStateId);
    assert.deepEqual(decodeSnapshot(encodeSnapshot(region)).data, region.data);
    player.apply({ version: 1, seq: 1, controls: 1, yaw: 0, pitch: 0 });
    await new Promise((r) => setTimeout(r, 300));
    player.apply({ version: 1, seq: 2, controls: 0, yaw: 0.5, pitch: 0.1 });
    assert.ok(
      movements.some((p) => Math.abs(p.z - 8) > 0.1),
      'Intent must produce a Minecraft movement packet',
    );
    assert.equal(errors.length, 0);
    const disconnected = once(player, 'closed');
    player.close();
    await disconnected;
    assert.equal(player.status, 'closed');
  },
);
