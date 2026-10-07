# Local Roblox frontend

Run `Mineblox.bat` from the repository root. The launcher restores dependencies,
builds `.local/roblox/Mineblox.rbxlx`, starts a private Minecraft/bridge pair and
opens Studio. The official built-in Studio MCP starts Play automatically when
enabled in Assistant settings. No third-party Studio plugin is required. Studio
installation and sign-in are prerequisites.

Use `Mineblox.bat -MinecraftAssets` once to opt into the pinned mcasset.cloud
development set, or provide `MINEBLOX_ASSET_ROOT`. Later launches reuse the cache.
Real textures, HUD images and the local bearer credential exist only in ignored
`.local`. The generated place is private development output: do not publish it.
Minecraft asset usage/upload rights are not granted by the provider's website license.

The generated hierarchy embeds:

- ServerScriptService: server lifecycle/remotes, BridgeTransport and private config.
- ReplicatedStorage/MinebloxClient: Renderer, Images, Hud and private pixel data.
- StarterPlayerScripts: first-person input/camera, entity presentation and render queue.

Player identity is derived from the server Player object. Studio's simulated
non-positive user IDs have a reserved development mapping. Clients send held
intentions at 20 Hz; one shared 5 Hz HTTP exchange forwards latest intentions.
Stale/disconnected input stops after 750 ms. A separate 2 Hz endpoint sends terrain.
This totals at most 420 periodic external requests/minute for the entire game server,
with remaining capacity for joins/leaves. Never multiply HTTP requests by frame rate.

The local Studio transport permits authenticated `http://127.0.0.1:<port>`.
Published games reject development string secrets and require HTTPS plus a
Roblox Secret named MINEBLOX_TOKEN. The repository does not provision a public gateway.

Four studs represent one Minecraft block. Camera look is immediate; movement
display follows Mineflayer prediction, extrapolated at most 200 ms, then smoothed.
Server corrections/large errors snap. Position, health, block outcomes and inventory
are never accepted from the Roblox client. Generic Minecraft entities use simple
visuals; original skins/equipment/animations remain future work.

Terrain uses 8^3 partitions in a bounded player-driven interest region. Each
texture batch uses a fixed-size EditableMesh with repeated block-scale UVs.
Allocation failure logs a warning and uses greedy-face geometry with substitute
colors. Minecraft HUD sprites are private EditableImages, not uploaded assets.
The common material catalogue covers the locally observed forest, but full
blockstate/multipart/fluid/biome/lighting fidelity is not implemented.

Controls: WASD, Space, Ctrl sprint, Shift sneak, mouse look, 1–9/wheel held slot,
Tab cursor release. Hotbar selection is forwarded to Minecraft; block interaction,
combat and inventory transactions are not exposed yet.

Developer tools (prefix with `rtk proxy` on the founding workstation):

```sh
npm run roblox:inspect
npm run test:crossplay
node tools/studio-smoke.js capture
node tools/studio-smoke.js console
node tools/studio-smoke.js stop
node tools/studio-sync.js
node tools/studio-smoke.js play
```

Tests select only the generated Mineblox place and never publish/upload assets.
MCP scripts are synced while in Edit mode. Source is also compiled with the
portable Luau compiler during local verification.
