import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  VoxelRegion,
  encodeSnapshot,
  decodeSnapshot,
} from '../bridge/voxels.js';
import { greedyMesh } from '../bridge/mesh.js';
import { validateInput } from '../bridge/input.js';
import { encodeVoxels } from '../bridge/voxel-wire.js';

function measure(name, iterations, operation) {
  for (let i = 0; i < 20; i++) operation();
  const samples = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) operation();
    samples.push(((performance.now() - start) * 1000) / iterations);
  }
  samples.sort((a, b) => a - b);
  return {
    name,
    iterationsPerSample: iterations,
    samples: 7,
    medianUs: samples[3],
    minUs: samples[0],
    maxUs: samples[6],
  };
}
const chunk = new VoxelRegion({ size: [16, 16, 16] });
chunk.data.fill(1);
const plane = new VoxelRegion({ size: [64, 1, 64] });
plane.data.fill(1);
const foliage = new VoxelRegion({ size: [8, 8, 8] });
foliage.data.set(Uint32Array.from({ length: 512 }, (_, i) => 1 + (i % 2)));
const foliageMesh = (cull) =>
  greedyMesh(foliage, (state) =>
    state === 0
      ? null
      : {
          key: String(state),
          opaque: false,
          cullSame: cull,
          cullKey: 'oak_leaves',
        },
  );
const wire = encodeSnapshot(chunk);
const input = { version: 1, seq: 1, controls: 1, yaw: 0, pitch: 0 };
const terrainCases = {
  uniform: new Uint32Array(512).fill(1),
  layered: Uint32Array.from({ length: 512 }, (_, i) => Math.floor(i / 64)),
  distinct: Uint32Array.from({ length: 512 }, (_, i) => 30000 + i),
};
const results = [
  measure('snapshot encode 16^3', 1000, () => encodeSnapshot(chunk)),
  measure('snapshot decode 16^3', 1000, () => decodeSnapshot(wire)),
  measure('greedy mesh solid 16^3', 50, () => greedyMesh(chunk)),
  measure('greedy mesh plane 64x1x64', 50, () => greedyMesh(plane)),
  measure('leaf variants 8^3 retaining interior faces', 100, () =>
    foliageMesh(false),
  ),
  measure('leaf variants 8^3 culling interior faces', 100, () =>
    foliageMesh(true),
  ),
  measure('input validation', 10000, () => validateInput(input)),
  ...Object.entries(terrainCases).flatMap(([name, data]) => [
    measure(`legacy terrain JSON ${name}`, 1000, () =>
      JSON.stringify(Array.from(data)),
    ),
    measure(`adaptive terrain encode + JSON ${name}`, 1000, () =>
      JSON.stringify(encodeVoxels(data)),
    ),
  ]),
  measure('single-voxel delta', 1000, () => {
    const revision = chunk.revision;
    chunk.applyDelta({
      base: revision,
      revision: revision + 1,
      changes: [{ x: 1, y: 1, z: 1, state: 1 }],
    });
  }),
];
const output = {
  date: new Date().toISOString(),
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0].model,
  results,
  snapshotBytes: wire.length,
  voxelStorageBytes: chunk.data.byteLength,
  planeQuads: greedyMesh(plane).length,
  foliage: Object.fromEntries(
    [false, true].map((cull) => {
      const quads = foliageMesh(cull);
      return [
        cull ? 'culled' : 'interiorFaces',
        {
          quads: quads.length,
          unitFaces: quads.reduce((area, q) => area + q.width * q.height, 0),
        },
      ];
    }),
  ),
  terrainJsonBytes: Object.fromEntries(
    Object.entries(terrainCases).map(([name, data]) => [
      name,
      {
        legacy: Buffer.byteLength(JSON.stringify(Array.from(data))),
        adaptive: Buffer.byteLength(JSON.stringify(encodeVoxels(data))),
      },
    ]),
  ),
  note: 'Local microbenchmarks; no network RTT, server TPS, Roblox FPS, total heap per chunk, or session scaling claims.',
};
await mkdir('.local', { recursive: true });
await writeFile('.local/benchmarks.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
