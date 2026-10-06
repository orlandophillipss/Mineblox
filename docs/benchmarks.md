# Validation and benchmark baseline — 2026-10-06

These measurements were actually executed on Windows x64, Node v24.16.0,
AMD Ryzen 7 9800X3D. They are local prototype results, not crossplay performance
claims. Raw records: [microbenchmarks](measurements/microbenchmarks.json) and
[live Minecraft observation](measurements/live-smoke.json).

## Functional validation

- 19 unit tests passed: input/identity validation, replay/sequence rejection,
  session failure/leases/cleanup, HTTP authentication/batching/limits/login races,
  snapshots/delta recovery/atomicity, malformed parser corpus, mesh exposed-face
  equivalence/occlusion/materials/borders, asset cache/integrity/errors/inheritance.
- One real TCP protocol integration test passed with pinned 1.21.4 configuration,
  login, teleport confirmation, palette chunk decoding, movement and disconnect.
  The fixture is not a vanilla simulation and cannot prove gameplay outcomes.
- The live smoke test passed against the official verified Java 1.21.4 server,
  after explicit user EULA acceptance. It connected a mover and independent
  headless observer through ordinary Minecraft protocol, observed the mover by
  username/entity, sent held-control input, observed server-replicated movement,
  received a server correction and round-tripped decoded nearby voxels.
- The implemented mcasset.cloud CLI cached the stone model (98 bytes) from the
  verified asset endpoint. Separate direct checks returned 200 for blockstate
  JSON and texture PNG. Those assets are only in ignored local cache.
- A live HTTP gateway check also created a real vanilla-server player, applied
  batched look input, deleted the session and verified mapping cleanup.

## Live observation (one sample)

| Measurement                                       | Result     |
| ------------------------------------------------- | ---------- |
| Two sequential player spawns                      | 390.05 ms  |
| Input application to movement visible to observer | 123.27 ms  |
| Observer polling resolution                       | 50 ms      |
| Extracted voxels                                  | 64 (4×4×4) |
| Encoded region                                    | 288 bytes  |
| Cube-only preview mesh                            | 6 quads    |

The observed result includes local Minecraft tick/network scheduling and poll
quantization; it is neither a pure bridge-processing latency nor a Roblox RTT.
One sample cannot establish p50/p95 distributions. The server ran successfully
using installed Java 25; Java 21 is the documented baseline for 1.21.4. No ordinary
graphical Minecraft client or Roblox Studio was opened for this test.

## Microbenchmarks

Seven samples per operation after warmup; median time per operation below.

| Operation                                 | Median   |
| ----------------------------------------- | -------- |
| Snapshot encode 16^3                      | 28.38 µs |
| Snapshot decode 16^3                      | 14.18 µs |
| Greedy mesh solid 16^3                    | 1.35 ms  |
| Greedy mesh 64×1×64 plane                 | 1.17 ms  |
| Held-input validation                     | 0.051 µs |
| Single-voxel delta validation/application | 0.144 µs |

The plane produced six merged quads. A 16^3 snapshot was 16,416 bytes; voxel typed
storage alone was 16,384 bytes. This excludes JS object/cache/library overhead.
Tiny-loop timings are particularly sensitive to JIT optimization; avoid treating
sub-microsecond values as a production throughput guarantee.

## Reproduction

```sh
npm ci
npm test
npm run test:integration
npm run bench
npm run minecraft:prepare
# Explicitly review/accept EULA, then start Minecraft in another terminal.
npm run minecraft:start
npm run test:live
```

Runtime measurements go into `.local/benchmarks.json` and `.local/live-smoke.json`.
The committed baseline is a dated reference; later runs do not overwrite it.
Keep game downloads/world/asset files out of commits. Stop the test server when
finished. CI checks format/lint/syntax/unit/TCP integration and uploads benchmark
artifacts. Numeric regression gates await stable runners and repeatable baselines.

## Initial targets and outstanding measurements

Targets, **not achievements**: bridge input processing p95 below 5 ms under the
tested workload, stable server 20 TPS, Roblox 60 FPS on agreed hardware, bounded
geometry work per frame, gameplay responses below 16 KiB, and terrain incapable
of starving input/corrections. Maintain 5 Hz shared HTTP gameplay exchanges with
reserved request capacity; never imply that this guarantees low latency.

Still measure: Roblox p50/p95/p99 RTT/jitter and reconciliation error, serialization
alternatives/palette packing/compression, chunk conversion, entity/event
throughput, session counts/CPU/GC, total cached-chunk/player memory, partition mesh
upload/device memory/instance counts, API latency under load and independent
terrain worker contention. No TPS, FPS, session scaling or public-network latency
results have been claimed.
