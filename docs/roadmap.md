# Roadmap and current scope

## Current milestone

M1/M2: protocol-level virtual player, bounded held-input control and independent
observer proof. M3 groundwork: decoded chunk extraction to a bounded voxel
snapshot, revision invariants and independent cube meshing. This initial run
ships a reproducible prototype, not complete Minecraft/Roblox crossplay.

## Implemented

- Git repository, GitHub remote, AGENTS.md, MIT license, research and architecture ADR.
- Mineflayer 1.21.4 virtual sessions, CLI movement/look and authenticated HTTP batching.
- Strict intention input, replay/version checks, identity reservation, leases and cleanup.
- Real TCP protocol fixture covering configuration/login, corrections, chunks and movement.
- EULA-gated verified Minecraft server setup and separate real-server smoke command.
- Bounded voxel snapshot codec/deltas, cube greedy mesher and invariant/fuzz-style tests.
- Optional cached mcasset.cloud/local asset provider with integrity/model parent handling.
- Repeatable benchmarks, formatting/lint/build/unit/integration CI.

Exact executed live validation and measurements are in benchmarks.md.

## Experimental

Server-only Roblox HTTPS transport module, primitive opaque-cube world preview,
raw u32 voxel wire encoding. No Studio execution, Roblox mesh upload, graphical
client inspection or production latency/scaling claim is attached to these.

## Next three concrete tasks

1. Studio HTTPS transport test: shared request budget, p50/p95 RTT and reconnect
   failure behavior; confirm secrets/config/runtime platform constraints.
2. EditableMesh renderer slice: one bounded voxel region, non-proprietary textures,
   safe partitioning, winding/UVs, client memory and culling measurements.
3. Local prediction/reconciliation + interpolated Minecraft player entities,
   tested with a native graphical Minecraft client and explicit world epochs.

## Following vertical slices

Snapshot/delta terrain streaming and block-event remeshing -> authoritative block
break/place round trip -> generic entities/equipment/animations -> combat and
knockback -> inventory/items -> load/scaling/worker queues -> dimensions/respawn ->
complex End entities -> cooperative Ender Dragon benchmark.

## Current blockers and deliberate omissions

Roblox Studio/published test experience and reachable authenticated HTTPS gateway
are required for frontend proof. No online-mode Minecraft identity linking,
Microsoft credentials, multi-game-server isolation or production asset rights
resolution is provided. Go gateway adoption waits for measured need. Continuous
world cache, entity transport, block actions, combat, inventory and frontend
prediction are not implemented yet. Minecraft remains their future authority.
