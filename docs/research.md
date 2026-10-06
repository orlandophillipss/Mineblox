# Initial research — 2026-10-06

These are verified upstream candidates, not performance claims. GitHub default
branch activity was queried directly; exact version compatibility must still be
tested against a pinned release. Prototype baseline is **Java 1.21.4**, not an
assertion that this is the latest Minecraft release.

## Candidate comparison

| Project/source                                                                                          | Language and license                                                     | Maintenance / versions                                                                                                                                | Provides; fit and integration cost                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Mineflayer](https://github.com/PrismarineJS/mineflayer)                                                | JS; MIT                                                                  | Active; upstream README advertises 1.8–26.1; npm 4.39.0 selected, 1.21.4 tested here                                                                  | High-level headless player, client physics, world/entity knowledge, actions and inventory. Lowest implementation risk. One dependency ecosystem. **Use for initial adapter**; do not assume every advertised version works without tests.           |
| [node-minecraft-protocol](https://github.com/PrismarineJS/node-minecraft-protocol)                      | JS; MIT                                                                  | Active; versioned schemas; installed 1.68.0                                                                                                           | TCP, compression, login/configuration, authentication and packet codecs. Underlies Mineflayer and our TCP test fixture. Direct use alone would require much more player-state/movement handling.                                                    |
| [prismarine-chunk](https://github.com/PrismarineJS/prismarine-chunk)                                    | JS; MIT                                                                  | Active; version-dispatched Java/Bedrock codecs; installed 1.41.0                                                                                      | Palette/section decoding, block access, light data. Reuse through Mineflayer; don't handwrite a packet chunk decoder. Disk chunk conversion isn't needed for the first slice.                                                                       |
| [go-mc](https://github.com/Tnze/go-mc)                                                                  | Go; MIT                                                                  | Latest queried default commit 2024-12-24, [539b4a3](https://github.com/Tnze/go-mc/commit/539b4a3a7f030332eb58b8a946116ae7907630d2); 1.21.1-era client | Protocol, bot framework, NBT and region/chunk tools. Best pure-Go candidate but less high-level player coverage and older baseline. Moderate/high adapter work for our 1.21.4 target. **Keep as candidate; don't use now**.                         |
| [Azalea](https://github.com/azalea-rs/azalea)                                                           | Rust; MIT                                                                | Active; README pins 26.2, deliberately latest-version-oriented and warns of breaking changes                                                          | Client/protocol/world/physics/auth, swarms, interactions. Strong alternative to Mineflayer for measured scale/latest-version needs. Rust/ECS integration and a different version baseline increase initial cost. **Revisit if evidence favors it**. |
| [Pumpkin](https://github.com/Pumpkin-MC/Pumpkin)                                                        | Rust; GPL-3.0 server; plugin API MIT/Apache-2.0                          | Very active; README targets latest Java/Bedrock; still heavy development with AI/combat/boss work tracked                                             | Server rewrite with direct state access, but incomplete vanilla coverage makes eventual dragon/mechanics fidelity a separate project risk. GPL obligations matter for modified distributions. **Do not replace Minecraft for the prototype**.       |
| [Valence](https://github.com/valence-rs/valence)                                                        | Rust; MIT code; separate noncommercial logo license                      | Latest queried default commit 2026-06-15; early framework; recent-version target requires code verification                                           | Bevy-based server engine, protocol/chunks/entities/NBT. Vanilla mechanics are optional/user-built. Excellent custom minigame foundation, poor fit for avoiding a gameplay rewrite. **Do not use as authority**.                                     |
| [FastNBT / FastAnvil](https://github.com/owengage/fastnbt)                                              | Rust; MIT/Apache-2.0                                                     | Existing parser ecosystem; FastAnvil documents 1.13+, weaker 1.12 support                                                                             | Serde NBT and Anvil region reading. Useful offline world tooling, not live protocol/player emulation. **No additional Rust component needed now**.                                                                                                  |
| [Paper](https://github.com/PaperMC/Paper), [setup docs](https://docs.papermc.io/paper/getting-started/) | Java; project license notices include GPL and MIT components             | Established server ecosystem; select a release matching the tested protocol                                                                           | Mature Minecraft behavior with plugins/observability. Optional plugin can expose server-accepted positions/ticks/security checks. Initial plain vanilla server proves unmodified protocol path first. **Preferred later hosted server option**.     |
| [Purpur](https://purpurmc.org/), [source](https://github.com/PurpurMC/Purpur)                           | Java; own changes MIT, inherited Paper/Spigot license notices also apply | Paper-derived maintained version branches                                                                                                             | Additional configurable behavior. No concrete bridge advantage over Paper today; extra deviations can complicate fidelity. **Optional operator choice, no required dependency**.                                                                    |
| [Vanilla Java server](https://www.minecraft.net/en-us/download/server)                                  | Java; proprietary Minecraft EULA                                         | Mojang manifest provides exact version/JAR/hash                                                                                                       | Full authoritative mechanics and native-client compatibility. Download locally, verify metadata/JAR, require explicit EULA acceptance. **Use 1.21.4 for reproducible first live test**, distribute no JAR.                                          |
| [Prismarine web client](https://github.com/PrismarineJS/prismarine-web-client)                          | JS; MIT                                                                  | Existing browser frontend built on Mineflayer                                                                                                         | Demonstrates normal-server access via a restricted frontend. Browser WebSocket-to-TCP design is useful precedent, but Roblox's published runtime is a separate transport constraint.                                                                |

No code from a Rust rewrite was copied. Selecting Mineflayer instead of Go is
an intentional first-slice tradeoff: an existing movement/world adapter provides
more immediate value than the gateway language preference. A second runtime is
deferred until a narrow adapter API and a benchmark justify it.

## Roblox networking findings

[HttpService](https://create.roblox.com/docs/reference/engine/classes/HttpService)
documents 500 external requests/minute and a separate Open Cloud budget. Requests
are server-side and must be enabled. Its CreateWebStreamClient documentation
limits that streaming facility to Studio; it is not a production raw socket.
No arbitrary TCP/UDP capability was found for published experience scripts.
We therefore use server-side HTTPS RequestAsync for this spike, not UDP or
unverified production WebSockets. Recheck official docs at each transport ADR.

One 5 Hz exchange for all players uses 300 requests/minute. Per-player polling
would exhaust that budget quickly. Combine upload/download for gameplay,
coalesce held inputs, cap in-flight exchanges, and reserve capacity for control
and terrain. HTTP RTT, shared rate limits, backend response size and scheduling
will dominate; five polls/sec is not automatically a playable experience.
Long polling can help downstream wakeups but does not raise the input budget
and occupies request capacity. Benchmark before adopting it.

[Roblox remotes](https://create.roblox.com/docs/scripting/events/remote) provide
the internal client/server leg. Use ordered reliable events for discrete
actions/results, and sequenced
[UnreliableRemoteEvent](https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent)
for ephemeral movement/effects where useful. Its documented payload limit is
1,000 bytes; oversized payloads drop. Keep terrain off movement remotes. These
events do not connect Roblox to external infrastructure.

## Roblox rendering findings

[EditableMesh](https://create.roblox.com/docs/reference/engine/classes/EditableMesh)
can create and modify geometry displayed through MeshParts. It has device-side
memory budgets and limits of 60,000 vertices / 20,000 triangles; allocation can
fail. Editable state does not automatically replicate to clients, so local
generation from replicated voxel/mesh data is the intended path. Asset permissions
and experience settings still require a live Studio check. There is no useful
universal "safe Part count": measure devices, draw calls, material grouping and
memory. Roblox Terrain cannot preserve arbitrary Minecraft block geometry/UVs.

## Protocol/data implications

Versioned PrismarineJS schemas handle modern login/configuration, teleport IDs,
relative flags, palettes, entity metadata and movement formats. The selected
protocol fixture exercises real serialized 1.21.4 bytes, including configuration,
chunks and position confirmation. Mineflayer's
[physics source](https://github.com/PrismarineJS/mineflayer/blob/master/lib/plugins/physics.js)
distinguishes client simulation from forced server movement and suppresses
movement outside play state. Regular own-position updates are client prediction;
vanilla does not send an acknowledgement for every accepted movement.

Live chunks are section-based paletted block states, with light/biomes and block
entities separately. Preserve global version-local state IDs in this prototype;
use palette packing for production payloads after measurement. Disk Anvil/NBT
is a different format and should remain an offline-import concern. Entity
relative moves, teleports, metadata, equipment, velocity and removal are distinct
events. Preserve stable IDs plus spawn generations and discrete event ordering;
don't reduce all entities to position-only player records.

## Authentication and identity

Offline-mode is only for a loopback development server; deterministic `RB<userId>`
names yield ordinary offline UUIDs through Minecraft's protocol stack. Roblox
server code must map engine-verified identities. A Roblox account is not a
Microsoft/Minecraft entitlement. Online-mode requires legitimate authenticated
Minecraft sessions/account linking; the
[Mineflayer FAQ](https://github.com/PrismarineJS/mineflayer/blob/master/docs/FAQ.md)
documents Microsoft auth but does not solve our multi-user entitlement design.
Proxy forwarding or Paper hooks could support a separately designed trusted
deployment. Never claim arbitrary online-mode access or disable auth on a public server.

## mcasset.cloud assessment

The current site's
[query source](https://github.com/InventivetalentDev/mcasset.cloud/blob/main/query/assets.ts)
requests `https://assets.mcasset.cloud/<version>/<path>`. Direct checks returned
200 for 1.21.4 stone model JSON, blockstate JSON and texture PNG. The previously
guessed `raw.mcasset.cloud` failed; don't encode guessed hosts as an API.

This is a versioned static asset service, not a ready Roblox renderer or gameplay
API. Its underlying
[asset repository](https://github.com/InventivetalentDev/minecraft-assets)
contains files extracted from Minecraft JARs. The website's MIT code license
does not grant redistribution rights over those files. The bridge includes an
opt-in bounded cache with SHA-256 metadata, local extraction fallback and model
parent/texture-alias resolution. No textures/models are committed. See
docs/assets.md for Roblox import and rights limitations.

## Evidence gaps

Roblox Studio runtime, mobile memory budgets, texture repetition/atlas sampling,
multi-server session ownership, online account linking, 20 TPS stability, HTTP
jitter under load and an ordinary graphical Minecraft client's visual inspection
remain separate validation tasks. Default-branch activity alone is not proof of
production maturity. docs/benchmarks.md reports only work actually executed.
