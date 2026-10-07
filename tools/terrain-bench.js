import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { VirtualPlayer } from '../bridge/session.js';
import { TerrainService } from '../bridge/terrain.js';
const player = new VirtualPlayer({
  robloxId: '900000000004',
  createBot: mineflayer.createBot,
  minecraft: { host: '127.0.0.1', port: 25565, version: '1.21.4' },
});
const radius = Number(process.argv[2] ?? 3);
let models = {};
try {
  models = JSON.parse(
    await readFile('.local/roblox/model-catalog.json', 'utf8'),
  );
} catch {
  /* Optional private catalogue. */
}
const terrain = new TerrainService({ radius, models });
const expected = 3 * (2 * radius + 1) ** 2;
try {
  await player.ready();
  await player.bot.waitForChunksToLoad();
  const known = {},
    samples = [],
    names = new Set();
  let epoch,
    bytes = 0,
    quads = 0;
  for (let i = 0; i < 100 && Object.keys(known).length < expected; i++) {
    const start = performance.now();
    const world = await terrain.stream(player, { known, epoch });
    epoch = world.epoch;
    const encoded = JSON.stringify(world);
    samples.push(performance.now() - start);
    bytes += Buffer.byteLength(encoded);
    for (const p of world.partitions) {
      known[p.key] = p.revision;
      quads += p.quads.length;
      for (const material of p.palette) names.add(material.name);
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const report = {
    date: new Date().toISOString(),
    minecraftVersion: '1.21.4',
    partitionSize: 8,
    radius,
    modelCatalogue: Object.keys(models).length,
    partitions: Object.keys(known).length,
    requestCount: samples.length,
    totalQuads: quads,
    totalJsonBytes: bytes,
    p50RequestWorkMs: sorted[Math.floor(sorted.length * 0.5)],
    p95RequestWorkMs: sorted[Math.floor(sorted.length * 0.95)],
    materials: [...names].sort(),
    note: 'Real vanilla normal-world partition extraction, worker meshing and JSON serialization; local sampling, not Roblox network RTT or FPS.',
  };
  if (report.partitions !== expected)
    throw new Error('Benchmark did not stream the complete interest region');
  await writeFile('.local/terrain-bench.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  player.close();
  await terrain.close();
}
