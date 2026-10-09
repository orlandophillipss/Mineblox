# Roadmap and current scope

## Current milestone

M1/M2: protocol player and observer proof. M3/M4: bounded terrain streaming,
fixed-size EditableMesh rendering, private real Minecraft textures/HUD and local
Studio cross-client movement. This is a working local frontend prototype, not
complete Minecraft client parity or published crossplay.

## Implemented

- Git repository, GitHub remote, AGENTS.md, MIT license, research and architecture ADR.
- Mineflayer 1.21.4 virtual sessions, CLI movement/look and authenticated HTTP batching.
- Strict intention input, replay/version checks, identity reservation, leases and cleanup.
- Real TCP protocol fixture covering configuration/login, corrections, chunks and movement.
- EULA-gated verified Minecraft server setup and separate real-server smoke command.
- Bounded voxel snapshot codec/deltas, cube greedy mesher and invariant/fuzz-style tests.
- Optional cached mcasset.cloud/local asset provider with integrity/model parent handling.
- Repeatable benchmarks, formatting/lint/build/unit/integration CI.
- One-file Windows bootstrap/launcher, vanilla normal-world generation and official Studio MCP automation.
- Separate terrain worker/cache, render acknowledgements, eviction and dimension/session reset handling.
- Real HUD sprites, server-backed health/food/experience/hotbar and simple entity interpolation.
- Roblox keyboard movement observed by a separate Minecraft protocol client with settled coordinate comparison.
- Fixed-tick local movement prediction/input replay and bounded remote interpolation.
- Server-validated mining, placement, attacks, real window/cursor inventory, chat and commands.
- Viewport block icons, dropped-item metadata/meshes, common private mob skins and bitmap text UI.
- Creator Store effects, optional permitted music/importer and reconnect backoff.

Exact executed live validation and measurements are in benchmarks.md.

Phase 2's local bug fixes add compact voxel buffers, atlas/layer batches,
1.21.4 item-model audits, serial drag transactions, real manual table crafting,
held block controls and measured sprint/jump presentation. Details and remaining
gaps are in [phase2-bugfixes.md](phase2-bugfixes.md).

## Experimental

Published HTTPS transport, full blockstate/models, remote entity visuals and adaptive
voxel wire encoding remain experimental. Local Studio screenshots and a
Minecraft observer test are available; no production latency/scaling claim applies.

## Next three concrete tasks

1. Finish model uvlock/rescale, unsupported dynamic items, biome/light and fluid presentation.
2. Repeat forest/device/multiplayer/WAN measurements against the recorded flat-world samples.
3. Extend real container/recipe-book/flight/entity coverage and repeat native comparisons.

## Following vertical slices

Snapshot/delta terrain streaming and block-event remeshing -> authoritative block
break/place round trip -> generic entities/equipment/animations -> combat and
knockback -> inventory/items -> load/scaling/worker queues -> dimensions/respawn ->
complex End entities -> cooperative Ender Dragon benchmark.

## Current blockers and deliberate omissions

Published Roblox deployment requires a reachable authenticated HTTPS gateway.
No online-mode Minecraft identity linking,
Microsoft credentials, validated multi-server deployment or production asset rights
resolution is provided. Go gateway adoption waits for measured need. Continuous
shared production world cache, reliable event journals, exact movement/fluid
prediction, complete entity/equipment rendering and all container interactions
remain unfinished. Minecraft remains their authority.
