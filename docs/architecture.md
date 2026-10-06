# Architecture

```mermaid
flowchart LR
  RC[Roblox client: intentions, prediction, renderer] -->|Roblox remotes| RS[Roblox server: identity and batching]
  RS -->|HTTPS gameplay exchanges| GW[Mineblox gateway]
  GW --> VP[One headless Minecraft session per Roblox user]
  VP <-->|Normal Java TCP protocol| MC[Authoritative Minecraft server]
  Native[Native Minecraft client] <-->|Normal Java TCP protocol| MC
  Assets[Optional mcasset.cloud or local assets] -->|Development cache/import only| Renderer[Future Roblox render assets]
```

The first four arrows are the intended architecture; only gateway, headless
sessions and Minecraft protocol are validated locally today. Luau external
transport is experimental. Minecraft is the only gameplay authority.

## Ownership and boundaries

VirtualPlayer owns bridge identity, delivery sequences, leases and a reference
to Mineflayer; the library owns the virtual client's player/world state. Incoming
intentions are validated full held-control states plus look. Position, damage,
inventory and block results are never accepted from the frontend. Server health,
food and correction packets are exposed separately from predicted position.
Corrections retain their own revision. acceptedSeq means accepted by the bridge,
not applied or acknowledged by Minecraft.

The world model stores version-local state IDs in bounded regions. The render
model holds merged quads and later non-cube geometry. Input control and gameplay
authority do not depend on the mesher. Snapshot/delta modules are pure and tested;
continuous world synchronization is not wired to the HTTP API yet.

## Transport and prioritization

Minecraft uses ordinary TCP. Published Roblox server scripts use HTTPS with
batched gameplay request/response exchanges (initial 5 Hz). No custom UDP is
needed yet. Roblox remotes form the frontend/server boundary. Production terrain
must use an independently budgeted endpoint and worker queue, never a giant
payload in /v1/exchange. The initial gateway does not perform terrain work in
request handlers, so that failure mode is avoided by scope rather than a
production scheduling implementation.

Planned traffic classes: P0 held input/corrections, P1 combat/discrete events,
P2 nearby entities, P3 block deltas, P4 terrain, P5 background detail. Reserved
request capacity is necessary but does not remove HTTP head-of-line effects,
event-loop contention, or shared platform throttling. Benchmark real Roblox RTT.
Bound queues, coalesce replaceable state, drop distant updates first, and resync
reliable world data on revision gaps. Never coalesce away damage/death events.

## Planned cache and presentation

Shared cache keys: server + world epoch + dimension + chunk/subchunk coordinates.
Store palette/block IDs, revision, block entities and metadata; entity lifecycle
has separate IDs/spawn generations. Negative coordinates use floor division.
Bound delta journals and fall back to a snapshot when history is missing. Interest
regions follow world movement, while camera frustum/culling stays client-local.
Reconnect starts a new session/epoch, not continuation of an old input sequence.

Roblox predicts own input immediately, smooths small errors, snaps teleports/large
errors and reconciles against server observations. Interpolate remote entity
buffers by timestamp/sequence; keep damage/removal/death discrete. No such
presentation layer is shipped yet.

## Lifecycle and scalability

Each session reserves its identity before waiting for spawn, preventing duplicate
login races. Spawn failure, kick/error, idle expiry, DELETE and shutdown clean up
the connection/mapping. Held movement expires after 750 ms without a new frame;
30 seconds without accepted input removes the session. The standalone CLI uses
a 1.5-second movement lease for manual commands.

One trusted Roblox server per gateway and at most 16 sessions are development
limits. Production needs verified game-server ownership, per-owner quotas,
account linking, token rotation, session-resume semantics, bounded adapter cache,
workers, metrics and load tests. Do not imply the 16-session limit is benchmarked
capacity. Session transport changes should follow ADR 0001.

The Ender Dragon remains a future integration stress test: multipart entities,
crystals, explosions, blocks, projectiles, inventory, death/respawn and dimensions
must pass through generic state/event replication, not special client game logic.
