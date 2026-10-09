# Changelog

## 0.2.0-beta.6 — 2026-10-09

- Raised the client's nighttime ambient floor so shaded block textures stay
  readable instead of becoming nearly black. Daytime still reaches white ambient;
  server time, dark night sky/fog and disabled direct solar glare are preserved.
- Checked the night-floor setting in the user's forest scene, then installed it
  through a fresh Studio playtest. Illumination is still an approximation until
  Minecraft block/sky light data is rendered.
- Replaced the soft-alpha leaf workaround with hard depth-tested cutouts. Cutout
  meshes no longer carry an opaque texture underlay; atlas cells bake foliage tint
  and directional shades so transparent holes retain their color and depth.
- Culled coincident leaf interiors across distance/persistence variants and
  partition boundaries; cube surfaces use front faces while model cards retain
  both sides. Added real worker/extraction regressions and a reproducible foliage
  benchmark to reduce geometry pressure behind the mesh-budget fallback panels.

## 0.2.0-beta.5 — 2026-10-09

- Fixed terrain HTTP 500 responses when a streamed partition contains water or
  lava: a face-origin variable shadowed the neighbor lookup before initialization.
- Added real worker regressions for water/lava source, flowing and falling levels,
  including fluid and opaque neighbors across partition boundaries.
- Fixed black holes in leaf textures on the tested Studio build by using Roblox's
  soft-alpha rendering path for cutout atlas batches. Water keeps its existing
  transparency. This path has transparency sorting tradeoffs; device checks remain.
- Verified fresh forest streaming and textures in the local Studio playtest.
  Upgrade the place/client and restart the bridge together; private assets and
  existing worlds are preserved.

## 0.2.0-beta.4 — 2026-10-09

- Fixed the manager reporting stopped while a standalone launcher holds the
  world lock. All new launchers expose authenticated local status, console and
  save-and-stop controls, including servers started by the native client.
- Added typed menu aliases including Stop host and launch profiles; unknown
  input now receives a useful message instead of silently doing nothing.
- Added real management-pipe, lock, authentication, bounds and interactive menu
  regressions. Older live launchers are identified rather than having their
  active locks deleted or their Minecraft processes forcibly terminated.

## 0.2.0-beta.3 — 2026-10-09

- Fixed repeated HTTP 504 joins when a Minecraft player reconnects while dead.
  The bridge now accepts server health and position without waiting for an alive
  spawn, displays the death screen and retains explicit Respawn input.
- Added health/position ordering and real TCP dead-login/respawn regression tests.
  Verified the saved dead player against the local vanilla server without
  automatically respawning or editing the save. Restart the bridge to apply.

## 0.2.0-beta.2 — 2026-10-09

- Fixed inventory cursor/drag coordinates, carried-stack cleanup, table slots,
  fitted tooltips and player preview; removed Done and the local mode button.
- Added audited 1.21.4 item-model icons, paginated Creative search and bounded
  asynchronous item/mob templates. Unsupported special models remain explicit.
- Added atlas material batching, adaptive voxel snapshots, stale worker job
  cancellation and bounded loaded-ground interest for high players.
- Fixed partial-block UVs, rotated cullfaces, quadruped body textures and the
  heavy-core texture alias; expanded the private common blockstate catalogue.
- Fixed sprint/jump presentation, short jump taps, held block actions, duplicate
  placement ghosts and invalid dropped-item attacks that disconnected vanilla.
- Removed default sky/post effects and direct solar glare; added original sky
  gradients, projected block clouds, moon phases, F3 debug and offline status.
- Added actual Studio camera benchmarks and isolated test-world console tooling.
  See `docs/phase2-bugfixes.md` for measured results and incomplete features.
- Upgrade client/place and bridge together. Existing worlds and private assets
  remain in `.local`; back up the host before upgrading. This is a local beta,
  not a complete or production-validated Minecraft implementation.

## 0.2.0-beta.1 — 2026-10-08

- Hosting choices: Cloudflare API token provisioning with a preview, browser
  authorization, existing tunnel tokens, or an HTTPS proxy with port forwarding.
  Existing unrelated DNS records are preserved. Native clients with different
  names have separate settings and game directories and share download caches.

- Added a numbered Windows manager and CLI for creating, selecting, renaming,
  backing up, restoring and archiving isolated Minecraft worlds.
- Added server/Studio/Minecraft/both launch profiles, named native client controls
  and normal Minecraft console commands including `say`, `op`, `deop` and `stop`.
- Added verified Cloudflare connector installation, free temporary HTTPS sharing
  and configuration for a stable named tunnel without port forwarding.
- Added game-server ownership checks, bounded deployment quotas and a separate
  credential-free Roblox publication build.
- Added versioned permitted-asset catalogs, bounded content refresh and explicit
  separation between content edits and code/place upgrades.
- Added Windows/server ZIP packaging, SHA-256 checksums and container deployment
  recipes. Original game binaries, Minecraft assets, worlds and secrets are excluded.
- Beta limits: public Roblox runtime/asset permissions and remote load/device
  tests are not established; published cross-platform chat and native public
  account linking remain unavailable. This is not a stable production release.

## 0.1.0 — 2026-10-08

- Minecraft-authoritative Java 1.21.4 bridge, local Studio terrain, private texture
  and HUD rendering, movement prediction and gameplay actions.
- Creator Store effects and a permission-gated audio importer.
- Startup port recovery and reuse of the managed Studio window.
- Direct official Minecraft GUI launcher with automatic Quick Play joining,
  server reuse and world-save/process cleanup.
- Initial protocol/TCP/live checks and documented parity/security limitations.

## Update policy

Record major content additions under their released version, including compatibility,
migration/backups, validation and known gaps. Keep previous ZIPs downloadable.
Never advertise proposed features as tested behavior.
