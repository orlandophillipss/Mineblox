import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { VirtualPlayer } from '../bridge/session.js';
import { minecraftConfig } from '../bridge/config.js';
import {
  extractRegion,
  encodeSnapshot,
  decodeSnapshot,
} from '../bridge/voxels.js';
import { greedyMesh } from '../bridge/mesh.js';

const players = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const minecraft = minecraftConfig();
  const started = performance.now();
  for (const robloxId of ['900000000001', '900000000002']) {
    const player = new VirtualPlayer({
      robloxId,
      minecraft,
      createBot: mineflayer.createBot,
    });
    players.push(player);
    await player.ready(30000);
  }
  const [mover, observer] = players;
  const spawnMs = performance.now() - started;
  await mover.bot.waitForChunksToLoad();
  await observer.bot.waitForChunksToLoad();
  let seen;
  for (let i = 0; i < 100; i++) {
    seen = Object.values(observer.bot.entities).find(
      (e) => e.username === mover.name,
    );
    if (seen) break;
    await wait(50);
  }
  assert.ok(
    seen,
    'The Minecraft server must replicate the virtual player to a separate observer connection',
  );
  const before = seen.position.clone();
  const inputAt = performance.now();
  mover.apply({ version: 1, seq: 1, controls: 1, yaw: 0, pitch: 0 });
  let firstObservedMs;
  for (let i = 0; i < 40; i++) {
    await wait(50);
    seen = observer.bot.entities[seen.id];
    if (seen && seen.position.distanceTo(before) > 0.1) {
      firstObservedMs = performance.now() - inputAt;
      break;
    }
  }
  mover.apply({ version: 1, seq: 2, controls: 0, yaw: 0.5, pitch: 0.1 });
  assert.ok(
    firstObservedMs !== undefined,
    'Observer must see server-replicated movement',
  );
  assert.ok(
    mover.lastCorrection,
    'Must receive a Minecraft server position correction',
  );
  const origin = mover.bot.entity.position.floored();
  const region = extractRegion(
    mover.bot,
    [origin.x - 2, origin.y - 1, origin.z - 2],
    [4, 4, 4],
  );
  const binary = encodeSnapshot(region);
  assert.deepEqual(decodeSnapshot(binary).data, region.data);
  const quads = greedyMesh(region);
  const result = {
    version: 1,
    minecraftVersion: minecraft.version,
    node: process.version,
    date: new Date().toISOString(),
    spawnMs,
    inputToObserverMs: firstObservedMs,
    pollResolutionMs: 50,
    voxelCount: region.data.length,
    snapshotBytes: binary.length,
    cubePreviewQuads: quads.length,
    serverCorrectionReceived: true,
    observedPlayer: mover.name,
    note: 'Separate headless observer on a real Minecraft server; no GUI or Roblox FPS/TPS validation. Meshing treats every non-air state as an opaque cube.',
  };
  await mkdir('.local', { recursive: true });
  await writeFile('.local/live-smoke.json', JSON.stringify(result, null, 2));
  await writeFile('.local/world-snapshot.mbv', binary);
  await writeFile(
    '.local/world-preview.json',
    JSON.stringify({
      version: 1,
      minecraftVersion: minecraft.version,
      dimension: mover.bot.game.dimension,
      quads,
    }),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const player of players) player.close('smoke test complete');
}
