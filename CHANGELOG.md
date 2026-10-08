# Changelog

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
