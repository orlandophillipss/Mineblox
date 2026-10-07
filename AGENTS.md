# Mineblox engineering instructions

## Mission

Expose an authoritative Minecraft Java simulation through a realtime translation
layer so Roblox and native Minecraft players can inhabit the same world. A Roblox
user maps to a real Minecraft protocol connection, never an NPC substitute.

## Non-negotiable principles

- Minecraft owns gameplay, world changes, health, inventory, AI, damage and progression.
- Roblox clients are untrusted input/render/UI frontends. Derive identity from the
  server's Player object. Never accept client positions, damage, inventories or block outcomes.
- Reuse mature protocol/client libraries. Their normal client physics is prediction,
  not a second authoritative simulation. Never label predicted position as server-acknowledged.
- Never use one Roblox Part per block as the primary renderer. Preserve voxels separately.
- Keep gameplay requests separate from terrain work. Add no camera-triggered requests
  or unnecessary round trips. Bound work, input leases, payloads, queues and sessions.
- State IDs are version-local. Scope cached state by server, dimension and world epoch.
  Version incompatible formats explicitly. Missing deltas must trigger snapshot resync.
- Do not add dependencies/languages without evidence and an ADR. Go remains a candidate
  for a measured gateway bottleneck, not an obligatory second process.
- Do not redistribute Minecraft binaries or assets. mcasset.cloud is an optional
  development provider; its website license does not license Minecraft content.
- Never bypass tests, hide errors, invent benchmark results, or commit secrets.
- Avoid speculative refactors and stylistic rewrites of working subsystems.
- Verify current Roblox/platform capabilities and Minecraft packet behavior using
  official docs or upstream source. Do not infer arbitrary sockets are supported.

## Current architecture and scope

Node 24 + pinned Mineflayer, single process. Existing vanilla/Paper-compatible
Minecraft Java 1.21.4 server is authoritative. HTTP control-plane gateway accepts
full movement intentions, creates one offline-mode protocol session per Roblox
identity, and batches state/input exchanges. The Minecraft TCP protocol is owned
by Mineflayer/PrismarineJS. Loopback-only Minecraft target is enforced in this
development build. Online-mode identity linking is not implemented.

Pure modules implement bounded voxel snapshots, revision deltas and cube greedy
meshing. A separate worker streams bounded 8^3 terrain partitions to the Roblox
frontend. Studio has validated server transport, fixed-size EditableMesh terrain,
private EditableImage Minecraft textures/HUD, first-person movement presentation
and remote entity interpolation. The default launcher uses authenticated loopback
HTTP in Studio. Published servers still require HTTPS and Roblox Secret configuration.

## Repository map

- `bridge/session.js`: virtual player lifecycle/input leases and prediction/correction distinction.
- `bridge/gateway.js`, `bridge/input.js`: authenticated HTTP, limits and intention schema.
- `bridge/config.js`, `bridge/main.js`: local development configuration and startup.
- `bridge/voxels.js`, `bridge/mesh.js`: canonical bounded regions, codec, deltas, cube meshing.
- `bridge/assets.js`: optional mcasset.cloud/local asset cache, hashes and model inheritance.
- `tools/player.js`: direct CLI; `tools/live-smoke.js`: real server observer test.
- `tools/minecraft.js`: verified local server download and EULA-gated launcher.
- `tools/bench.js`: microbenchmarks; `.local/`: ignored downloaded/cache/test outputs.
- `tests/`: invariants; `tests/integration/`: real TCP fixture, not a vanilla simulation.
- `bridge/terrain.js`, `bridge/terrain-worker.js`: bounded world interest/cache and off-thread meshing.
- `roblox/`: server transport, client camera/input, fixed-size mesh renderer, image loader and HUD.
- `Mineblox.bat`, `tools/bootstrap.ps1`, `tools/launcher.js`: one-file local launch and dependency bootstrap.
- `tools/studio-*.js`, `tools/mcp-proxy.js`: official Studio MCP automation; private place/config in `.local`.
- `docs/`: research, architecture ADR, protocol, rendering, assets, benchmarks and roadmap.

## Exact development commands

Use Node 24 (>=24.0). On this workstation all shell invocations must be prefixed
with `rtk`, following the user instruction at `C:\Users\owphi\.codex\RTK.md`.
Use `rtk proxy` for commands without a specialized RTK handler. Elsewhere the
portable commands below work without RTK. Windows may require `npm.cmd`.

```sh
rtk proxy npm.cmd ci
rtk proxy npm.cmd run format
rtk proxy npm.cmd run format:check
rtk proxy npm.cmd run lint
rtk proxy npm.cmd run build
rtk proxy npm.cmd test
rtk proxy npm.cmd run test:integration
rtk proxy npm.cmd run bench
rtk proxy npm.cmd run minecraft:prepare
rtk proxy npm.cmd run minecraft:start
rtk proxy npm.cmd run test:live
rtk proxy npm.cmd run player -- 123
rtk proxy npm.cmd run dev
```

Build is syntax validation for plain JavaScript, not a generated executable.
Copy `.env.example` to `.env`, replace the placeholder with a unique secret.
Review Minecraft's EULA and explicitly accept in the ignored server directory
before startup. Agents must never accept new terms on a user's behalf without
explicit authorization. Run live tests only against the development server.

## Work loop and quality gates

1. Understand the task; read existing implementation and relevant docs.
2. Check authority, transport and version constraints; choose the smallest coherent slice.
3. Implement with narrow interfaces and justified dependencies.
4. Format, lint, build, run targeted and broader unit tests.
5. Run integration tests for protocol/session changes; live tests where available.
6. Benchmark changed hot paths; compare reproducible measurements, not guesses.
7. Inspect diff for drift/security/assets/secrets; update architecture/protocol docs.
8. Commit coherent working changes. Do not advertise planned behavior as working.

CI must pass formatting, lint, syntax validation, unit/integration tests. Benchmark
artifacts are published; numeric regression gates await stable runners/baselines.
Dependency audit issues must be understood and documented, not "fixed" by blindly
downgrading Mineflayer. See docs/security.md for the initial transitive advisory.

## Sustain checks on every relevant change

- **Architecture:** Is Minecraft still authoritative? Did client prediction become
  duplicate game rules? Is state duplicated unnecessarily? Can multiple sessions work?
- **Performance:** Did allocations, instance count, message size or latency grow?
  Can terrain or synchronous meshing block input? Measure before optimizing.
- **Protocol:** Is compatibility explicit? Are sequences/revisions checked? Can stale
  data corrupt state? Can missing deltas recover? Is dimension/epoch scope correct?
- **Rendering:** Are faces merged with safe keys? Are UVs correct? Can one voxel
  remesh only its partition plus relevant neighbors? No block-per-Part regressions.
- **Security:** What if a client lies, replays or sends oversized/malformed input?
  Are identities/leases/coordinates/actions bounded? Are errors and cleanup safe?
- **Quality:** Are tests meaningful invariants? Are failures observable? Are docs
  accurate? Do TODOs conceal broken behavior? Do logs expose credentials?

## Shipping loop and current work

Prefer demonstrable vertical slices: headless protocol player -> input/observer
round trip -> bounded chunk extraction -> optimized Roblox region -> prediction
and reconciliation -> players/entities -> block actions -> combat/inventory ->
multiplayer load -> dimensions/complex entities -> Ender Dragon benchmark.

Current milestone: M1/M2 protocol player proof plus M3/M4 local Studio terrain,
Minecraft HUD and cross-client movement proof. Consult docs/roadmap.md and
docs/benchmarks.md for exact validation status.
Biggest next risk: playable latency under Roblox's external HTTP budget and
runtime mesh/device constraints. Keep the Minecraft virtual player boundary intact.

Next three tasks:

1. Extend blockstate variants, rotated logs, multipart/plant/fluid models and biome tint.
2. Measure input/observer latency distributions, client frame times and repeated streaming under load.
3. Extend validated block/inventory actions to full container/item/entity coverage and repeat graphical Minecraft comparisons.

Blockers for production: online authentication/account linking, HTTPS deployment,
Roblox runtime validation, continuous terrain/cache streaming, entity/events,
permissions/quotas, secure multi-server ownership and performance load testing.
