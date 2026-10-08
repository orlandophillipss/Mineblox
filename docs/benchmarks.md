# Validation and benchmark baseline — 2026-10-06

## Manager and hosting release checks — 2026-10-08

All **59 unit tests**, the real TCP protocol integration fixture, JavaScript
format/lint/syntax checks and Luau compile/invariant checks pass. Cloudflare API
provisioning is covered by a fixture for zone ownership, DNS conflicts, retries
and credential/error handling; it has not changed a real account.

The [live manager proof](measurements/manager-release-2026-10-08.json) records an
actual vanilla flat world with seed 43551 and creative mode, successful normal
console `say` output, a backup restored with byte-identical `level.dat`, and a
managed graphical client join/close. A second named client also joined through
Quick Play using its separate game directory; closing it preserved the host.
The original world was reselected and test services stopped with all dimensions
saved. These are lifecycle checks, not remote movement/parity measurements.

The [HTTPS tunnel check](measurements/https-tunnel-2026-10-08.json) reached the
real gateway through a temporary Cloudflare hostname and confirmed HTTP 401
without credentials. Minecraft stayed on loopback. The connector was stopped
after the test. The [publication audit](measurements/publication-audit-2026-10-08.json)
confirmed that the generated place omits the bearer and private pixel modules;
the same conditions were verified in Studio through its official MCP. This does
not establish a successful published Roblox join or licensed asset availability.

[New microbenchmarks](measurements/microbenchmarks-2026-10-08.json) retain the same
six-quad plane and 16,416-byte snapshot invariants. They ran alongside local
launcher checks and are not a controlled performance comparison. Container,
browser-auth/API-token live provisioning, public router/TLS and remote published
Roblox runtime/load checks remain outstanding.

## Direct Minecraft client validation — 2026-10-08

`Minecraft.bat` started the real local server and launched the official Java
1.21.4 GUI as `MinebloxJava`. Both client Quick Play metadata and the vanilla
server log confirmed an automatic join to `127.0.0.1:25565`. A normal client
window close exited with code 0, stopped its owned server and saved all three
dimensions. The test found an early TCP/status readiness race; startup now waits
for a compatible Minecraft status response and has a regression check.

The [server-reuse check](measurements/client-launch-reuse-2026-10-08.json)
confirmed an automatic GUI join to an existing server, a normal client exit,
continued server availability and bridge health HTTP 200 after client closure.
The controlled test server then saved and stopped through its private control
pipe. These are launcher/lifetime checks, not new gameplay parity measurements.

The [combined-launcher check](measurements/client-launch-combined-2026-10-08.json)
also confirmed automatic GUI joining and that stopping the launcher saved the
server and closed its owned GUI. This test used `--no-studio`; Studio startup
itself remains covered by the prior Windows launcher validation below.
All 46 Windows unit checks and the real TCP integration fixture passed.

The earlier graphics startup failure described below was resolved in these
launcher tests using the full metadata-derived JVM arguments and Java 21
`javaw.exe`. This does not retroactively change the GUI presence recorded in the
Patch 2 gameplay fixture. Client downloads, asset objects and raw game logs
remain ignored private files.

## Patch 2 checks — 2026-10-07

The [latest live fixture](measurements/playable-patch2-2026-10-07.json) passed
bidirectional chat, command permission denial, real inventory split/move,
server-observed mining/placement, invalid-target rejection, pig hurt, entity
replication, dropped oak-log mesh, block viewport icon, real keyboard movement,
inventory/chat UI and a loaded Creator Store UI sound. Local camera response was
41.03 ms, before input acknowledgement; server-observed movement was 100.37 ms.
After the key release, displayed/native-observer positions differed by 0.0514
blocks. This is one sample, not smoothness or 1:1 parity across all movement.
An earlier fixture had a graphical Minecraft client connected. The newest GUI
launches exit during graphics startup with Windows error 0xC00000FD, including
after Java 21 and a larger thread stack. This latest result explicitly records
GUI presence as false and uses a separate real Minecraft protocol observer.

The [paired profile](measurements/profile-patch2-2026-10-07.json) kept the same
camera for off/on/off culling samples. Cached partitions remained 147. Visible
MeshParts changed 529 → 267 → 529; visible triangles 55,880 → 26,730 → 55,880.
Frame p95 was 5.48 / 5.53 / 5.54 ms. Culling reduced visible geometry but did not
produce a measured frame-time improvement in this scene. Studio memory was about
2.55 GiB per sample; periodic HTTP traffic was about seven requests/second.

The [current terrain run](measurements/terrain-patch2-2026-10-07.json) sampled
147 partitions in 37 calls with common models and foliage faces: 17,243 quads,
832,892 JSON bytes, local work p50 4.53 ms and p95 12.82 ms. These are extraction,
worker and serialization timings, not HTTP latency. Scenes differ from the
earlier terrain baseline, so these figures do not establish a speedup.

35 unit tests, the real TCP fixture, Luau invariants/compilation and syntax/lint
checks passed during this patch. The audio uploader was checked with an injected
HTTP fixture and a local preview; no external audio creation was attempted.
Original image/model pixels, recordings and Minecraft binaries remain private.

The [shutdown/reconnect test](measurements/reconnect-patch2-2026-10-07.json)
kept the existing Studio playtest open while the development server stopped and
restarted. The client reported disconnection, froze with zero measured camera
drift, created a new Minecraft protocol session and resumed terrain streaming
after 25.40 seconds. The launcher did not create another Studio instance.

The [crack-overlay check](measurements/crack-patch2-2026-10-07.json) used official
Studio mouse input against a real block: zero visible crack faces while idle,
six while mining, and zero after release. This caught a Luau false/nil check
that had left the last breaking texture visible on subsequent hovered blocks.

## Local Studio validation — 2026-10-07

Startup recovery was retested through `Mineblox.bat` with occupied development
ports and a stale saved Studio PID. The launcher stopped the prior port owner,
reused the open Studio window, refreshed its MCP connection, reached READY and
started Play automatically. The inspected client had live Minecraft state and
terrain; only one Studio process remained. All 40 Windows unit tests passed,
including isolated port-owner cleanup, unrelated-listener preservation,
self-process protection and stale process/MCP selection. Windows-only process
checks are skipped in Linux CI; portable selection/validation checks still run.

The Windows batch launcher successfully restored dependencies, started the real
vanilla normal-world server and loopback bridge, built a private place, opened
the repaired Studio installation and started Play using the official MCP.
Real Minecraft HUD sprites and textured terrain were inspected in the viewport.
Resizable meshes exceeded the client memory budget; fixed-size mesh batches
resolved that failure in the tested forest. The inspected scene streamed all
75 interest partitions. Missing visible dark-oak/mushroom textures were added;
the final material diagnostic returned no substitute materials in that forest.

The [crossplay record](measurements/crossplay-smoke-2026-10-07.json) uses actual
Roblox keyboard input, forwarded through the server and gateway, plus a separate
Minecraft protocol observer. It moved 8.48 blocks, first observed movement after
105.69 ms, and measured 0.000308 blocks settled position difference. This is one
local sample, not a p95 latency measurement, native GUI comparison, or zero-latency
claim. Render inspection at that point found 194 MeshParts, 149 textured before
the additional forest material set, and a real HUD with server health/hunger 20.

The [final check](measurements/crossplay-final-2026-10-07.json), after correcting
mesh object-space placement, moved 8.21 blocks with first observation at 265.19 ms
and settled error 0.000469 blocks. All 300 inspected MeshParts had textures.
These two isolated runs demonstrate scheduling variation; neither establishes
a latency distribution. The final viewport showed the real forest and HUD.

The [terrain stream record](measurements/terrain-stream-2026-10-07.json) sampled
75 real 8^3 partitions in 19 calls: 8,386 quads and 287,575 JSON bytes total.
Extraction + worker mesh + JSON serialization measured p50 2.93 ms and p95
32.56 ms per call, including the cold worker startup sample. These values are
local work timings, not Roblox HTTP RTT or client frame times. The worker keeps
mesh construction off the gameplay event loop; bounded sampling still runs there.

23 unit tests, the real TCP integration fixture, JavaScript checks, Luau source
compilation and live Minecraft/Studio checks are the current validation set.
No server TPS, Roblox FPS, mobile-device, public HTTPS or multi-session scaling
claim is attached to this local prototype.

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
