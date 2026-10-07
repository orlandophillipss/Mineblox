# Mineblox

An experimental bridge that lets Roblox frontends control **real Minecraft Java
protocol players** in an authoritative Minecraft world. Native Minecraft users
connect normally. Minecraft owns game rules; Roblox provides input, rendering,
movement presentation and UI. This is an independent open-source project, unaffiliated with
Mojang, Microsoft or Roblox.

```mermaid
flowchart LR
  RobloxClient -->|Roblox remotes| RobloxServer
  RobloxServer -->|Batched HTTP in local Studio / HTTPS for deployment| Mineblox
  Mineblox <-->|One Java protocol session per user| MinecraftServer
  MinecraftClient <-->|Normal connection| MinecraftServer
```

## Status

The first prototype targets Minecraft Java **1.21.4**, Node **24**, and a
loopback-only offline development server. It implements headless protocol
sessions, CLI movement/look, authenticated HTTP input/state batching, leases and
cleanup. Chunk extraction, binary snapshots, revision-safe deltas and independent
cube greedy meshing are tested. There is an optional mcasset.cloud/local asset
cache. See [validation and measured results](docs/benchmarks.md).

The local Studio frontend now runs against a real vanilla server. It streams
8^3 terrain partitions, renders fixed-size EditableMeshes with block-scale UVs,
displays real Minecraft HUD sprites through private EditableImages, and forwards
keyboard/look intentions to the Minecraft player. Health, hunger, experience,
hotbar contents and nearby entity positions come from Minecraft. The default
server uses vanilla terrain generation, seed 12345 and survival mode; the older
flat test world is preserved separately.

Patch 2 adds local movement prediction/reconciliation, canonical collision voxels,
common block models, real window/cursor inventory, mining/placement, attacks,
chat/commands, dropped-item visuals, block viewport icons and Creator Store sound
effects. Minecraft owns the outcomes. [Parity status](docs/parity.md) records
remaining gaps; full 1:1 client behavior is not established.

## One-file Windows launch

Double-click **Mineblox.bat**. It installs missing Node/Java and portable Roblox
build tools, restores pinned dependencies, starts Minecraft and the loopback
bridge, builds the private place and opens Studio. With Studio's MCP enabled,
Play starts automatically. The launcher reuses its managed Studio window and
private loopback credential/port across restarts. Keep the launcher window open;
Ctrl+C stops services. Remove ignored `.local/launcher.json` to rotate the credential
after stopping the launcher.
Roblox Studio must be installed and signed in. Enable **Studio as an MCP server**
in Assistant → … → Manage MCP Servers once. The official Studio MCP is used;
no third-party Studio plugin is required.

For the real Minecraft texture/HUD development set on a fresh checkout, run:

```bat
Mineblox.bat -MinecraftAssets
```

Subsequent double-click launches reuse the private cache. Alternatively set
`MINEBLOX_ASSET_ROOT` to an extracted, user-provided Minecraft asset root. Generated
place, secrets, downloaded assets and server binaries stay in ignored `.local`.
Do not publish the generated development place. A new installation still needs
explicit Minecraft EULA acceptance; existing acceptance is preserved.

Controls: WASD, Space to jump, Ctrl to sprint, Shift to sneak, mouse to look,
1–9/wheel to select the held slot, left click to mine/attack, right click to place,
Shift-right-click to use a block, E inventory, Q drop, T or / chat, F3 diagnostics,
Tab to release the cursor. `/names display|username` changes Roblox chat names;
`/sound on|off` and `/music on|off` control configured audio. Native Java 1.21.4
clients connect to **127.0.0.1:25565**.

## Local development

Requirements: Node 24, npm, Java 21 or newer for the pinned development server,
Git; a Minecraft 1.21.4 client for optional visual inspection. No Go/Rust toolchain
or Docker is required for this slice.

```sh
npm ci
npm run minecraft:prepare
```

The setup downloads the official pinned server into ignored `.local/minecraft`,
checks Mojang's metadata/JAR hashes, binds it to 127.0.0.1 and leaves `eula=false`.
Review the [Minecraft EULA](https://www.minecraft.net/en-us/eula) and explicitly
set `eula=true` in `.local/minecraft/eula.txt` if you accept, then start the server:

```sh
npm run minecraft:start
```

In another terminal, prove server-replicated movement with two headless connections:

```sh
npm run test:live
npm run player -- 123
```

The live test records `.local/live-smoke.json`, a bounded voxel snapshot and cube
preview. The CLI joins as `RB123`; `forward`, `stop`, `look 0.5 0.1`, `state`, `quit`
control it. Combine control names, for example `forward sprint`. Held movement
expires after 1.5 seconds unless renewed. A normal Java 1.21.4 client can connect
to `127.0.0.1:25565` and observe the player. Close the server with `stop` in its
console. Offline mode is development-only and must never be exposed publicly.

## HTTP gateway

Copy `.env.example` to `.env` and replace BRIDGE_TOKEN with at least 32 random
characters. Start the Minecraft server, then:

```sh
npm run dev
```

Gateway defaults to 127.0.0.1:8080. Every endpoint requires bearer auth. POST
`/v1/sessions` with `{ "version": 1, "robloxId": "123" }`; use the returned ID
in `/v1/exchange` or `/v1/sessions/<id>/input`. Input contains only version, seq,
controls, yaw/pitch and optional held slot. [Protocol reference](docs/protocol.md) describes the schema,
limits and prediction/correction distinction. A bearer-authenticated Roblox
server is trusted to establish identity; direct Roblox clients cannot hold this key.

[Roblox setup](roblox/README.md) explains shared 5 Hz gameplay plus 2 Hz terrain
batching. Published Roblox servers need a reachable HTTPS gateway; the tested
launcher uses loopback HTTP in local Studio. No external hosting is provisioned.

## Textures and models

mcasset.cloud is supported as an optional **development/build asset source**:

```sh
npm run assets -- --remote --version 1.21.4 assets/minecraft/models/block/stone.json
```

Assets stay in ignored versioned cache with SHA-256 metadata. Local user-provided
extraction works too. No Minecraft textures/models/JARs are distributed here.
Service access does not establish asset redistribution or Roblox upload rights;
see [asset pipeline](docs/assets.md) and [rendering constraints](docs/rendering.md).

## Quality checks

```sh
npm run format:check
npm run lint
npm run build
npm test
npm run test:integration
npm run test:luau
npm run bench
```

Tests run without Minecraft credentials, game binaries or Roblox Studio. The TCP
fixture validates serialized protocol behavior; `test:live` is the separate real
Minecraft authority/observer check. Build performs JavaScript syntax validation.
CI uploads benchmarks without claiming stable numeric regression thresholds.
On the founding workstation, prefix shell commands with `rtk proxy` and use
`npm.cmd`; portable project commands above require no RTK installation.

Read [architecture](docs/architecture.md), [ADR](docs/adr/0001-authoritative-server-headless-adapter.md),
[research](docs/research.md), [security/dependency audit](docs/security.md),
[roadmap](docs/roadmap.md), and [agent instructions](AGENTS.md) before extending
the bridge. Go/Rust alternatives were evaluated; the initial single-runtime
adapter prioritizes the first working protocol slice.

See [audio configuration/import](docs/audio.md) for permitted audio assets and
[water behavior](docs/water.md) for the current fluid rendering boundaries.
