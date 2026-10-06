# ADR 0001: existing Minecraft server with a mature headless player adapter

Status: accepted for the prototype, 2026-10-06.

## Context

The biggest uncertainty is whether frontend intentions can drive a real Minecraft
player that normal clients see. Full game-mechanic fidelity is mandatory over
time. Roblox's external networking is constrained. Go is preferred for a future
concurrent gateway, but protocol/client completeness dominates the first slice.

## Options

| Strategy                                                        | First-slice cost       | Authority/fidelity                     | Tradeoffs                                                                                                                               |
| --------------------------------------------------------------- | ---------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A: existing server + headless clients                           | Lowest with Mineflayer | Existing Minecraft server              | Client prediction is not per-tick authoritative acknowledgement; per-user connections have a scaling cost.                              |
| B: existing server + Paper/Purpur plugin + bridge               | Moderate               | Existing server                        | Better accepted-position/tick telemetry and permission integration; adds Java build, server deployment and plugin maintenance.          |
| C: modified Rust server rewrite                                 | High                   | Depends on rewrite completeness        | Direct state access/performance opportunities; assumes responsibility for missing Minecraft mechanics and licensing obligations.        |
| D: mature client + Go translation service                       | Low/moderate           | Existing server                        | Attractive gateway language; extra process/runtime/IPC and state ownership before a measured need.                                      |
| E: Forge/Fabric server mod or proxy-integrated protocol adapter | Moderate/high          | Existing server with integration hooks | Useful for bespoke deployments, but narrower operator compatibility and extra runtime/version coupling. No clear first-slice advantage. |

## Decision

Use **A**, a single Node 24 process with Mineflayer 4.39.0, against a pinned Java
1.21.4 vanilla server. Paper may replace that server without changing the
protocol concept. Keep VirtualPlayer, transport, voxel representation, mesh
conversion and asset tooling separate. Add a Go gateway only when measurements
or deployment requirements justify D; add a small Paper plugin only if B is
needed for stricter accepted-position telemetry or permissions.

## Reasons

Mineflayer supplies ordinary protocol sessions, movement packets, client physics,
chunk/world/entity state, correction handling and future action primitives. This
avoids a homegrown protocol or gameplay implementation. Protocol fixtures run
without game binaries; a live two-connection observer test checks real server
replication. One runtime is the smallest useful experiment. See research.md for
the Go/Rust comparison and licenses.

## Tradeoffs and risks

- Node's shared event loop means large terrain jobs could stall all inputs.
  Keep extraction bounded; move production meshing to workers with bounded
  queues before connecting continuous terrain streaming.
- Minecraft checks client-supplied movement; this is not fully server-simulated
  input. Inputs are held controls only, and mature client physics proposes normal
  packets. Stronger policy/anti-cheat and server telemetry may require a plugin.
- Five batched HTTP exchanges/sec may still have unacceptable latency/jitter.
  Prediction and interpolation are necessary, not guarantees of playability.
- Offline UUID mapping is development-only. Online entitlement/auth/account
  linking is unresolved and cannot be replaced with arbitrary usernames.
- A session currently owns its Mineflayer world cache. Shared dimension cache,
  ref-counted interests and deduplication need load-test evidence and epoch rules.
- Transitive authentication dependencies have a moderate advisory; offline-only
  restrictions are a prototype scope, not a full vulnerability remediation.

## Revisit when

Input latency suffers from adapter CPU/GC, session memory scales poorly, a protocol
upgrade is unsupported, platform production streaming becomes available, accurate
server-accepted state is required, or the gateway's concurrency/auth requirements
outgrow one process. Compare an Azalea adapter, measured Go control service and
small Paper plugin before considering a server rewrite.
