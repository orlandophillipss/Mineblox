# Phase 2 bug-fix validation — 2026-10-08

This is a local Studio development release. Minecraft remains authoritative.
It does not establish complete Java parity, published crossplay or an end-game
playthrough. Original game assets and recordings are excluded from releases.

## Corrected behavior

- Removed Done and the local Creative grant button; E/Escape close the inventory.
- Added serial cursor states, drag distribution, double collection, clone input,
  actual table layout and carried-stack cleanup through real server transactions.
- Corrected GUI pointer coordinates for Roblox's top inset, fitted tooltips and
  the front-facing player preview. Counts remain Minecraft-owned.
- Compiled 1,279 item representations from actual 1.21.4 definitions. The private
  audit names 105 unresolved special/dynamic models. No generic cube is advertised
  as a working model for these items. Creative search pages through all 1,384
  registry entries; the mesh template cache is capped at 128.
- Prepared 253 world block models, including stairs/slabs/walls/doors/panes and
  saplings. Corrected partial-face UV scale, texture orientation, rotated
  cullfaces and the pinned heavy-core bare texture alias.
- Added atlas/layer batching, compact voxel storage, larger bounded terrain
  responses, stale-job cancellation and loaded surface bands for high players.
- Added sprint latching, short jump input retention, fixed-step presentation and
  a correction policy that avoids the measured mid-air camera rewind.
- Added held mining/placement, unique pending placement targets and ghost cleanup.
  Items/orbs/projectiles cannot be attacked through the bridge. Dropped item
  meshes no longer interrupt the mining ray or cause vanilla to kick the player.
- Corrected quadruped body skin UVs and asynchronous mob/item model preparation.
  Six common mob/player rigs have walking limb cycles, head pitch and hurt tint.
- Disabled default sky/cloud/post effects, replaced the photographic sky with
  original gradients and removed direct solar glare. Native square celestial
  sprites, moon phase crops and a projected fixed cloud layer are presentation.
- Hid the normal debug line behind F3, retained visible disconnect warnings, and
  hid survival vital bars in Creative/Spectator.
- Removed unrelated sound fallbacks. Only configured permitted Creator Store
  effects/music are played; exact Minecraft audio coverage remains incomplete.

## Live checks

All 76 unit tests, the real TCP fixture, JavaScript format/lint/syntax checks,
Luau compilation and client invariants passed. A shutdown test left the camera
stationary and displayed the disconnect warning, with zero degraded partitions.

An isolated vanilla server on loopback port 25566 used a separate superflat save.
The user's normal launcher, world and Studio process were preserved.

Real mouse input mined consecutive dirt blocks, received Minecraft `air` results,
and left zero visible crack labels after release. Holding placement produced four
real oak-plank blocks; its final attempt intersected the player and was refused
by Minecraft. All pending ghosts retired. The test first caught duplicate requests
against stale reference blocks; the unique-target guard removed those occlusion
failures. Invalid dropped-item attack protection was added after vanilla actually
kicked the old client during the first mining test.

Earlier live inventory checks moved/split stacks, distributed 16 planks into
5/5/5 with one carried item, returned that item on close, opened a real 3x3 table,
and shift-picked up four crafted sticks. Item browsing passed offsets 64 and 128;
the template cache reached its cap without retaining every page indefinitely.
The heavy-core missing icon was traced to its real model's bare texture alias.

The final controlled sprint sample had 1,207 camera frames, no backwards frames
and a mean forward speed of 5.685 blocks/s. A jump measured 1.252 blocks, about
0.292 s to apex and 0.592 s airborne. These are local display observations,
not server acknowledgements or WAN latency guarantees. The final stationary
sample had 147 cached partitions, 50 mesh parts, 12,720 triangles, zero degraded
partitions, frame p95 5.49 ms and p99 6.08 ms. Total Studio memory was about
3.18 GiB, not the mobile/client-only footprint. Different scenes and editor
focus/FPS caps prevent a claimed before/after FPS gain.

The benchmark rejects degraded geometry and a jump that did not execute. Raw
camera samples stay in `.local`; sanitized summaries are in
[client-bugfix-2026-10-08.json](measurements/client-bugfix-2026-10-08.json).

## October 9 texture/terrain hotfix validation

The user's forest HTTP 500 was a worker exception, `Cannot access 'at' before
initialization`, on water/lava faces. The face-origin variable shadowed the
neighbor lookup. A real worker regression now covers both fluids at levels 0,
7 and 8, exposed heights, fluid above and fluid/opaque partition neighbors.
All 84 unit tests, two real TCP integration tests, formatting/lint/syntax and
Luau compilation/client invariants passed.

A fresh playtest against the saved vanilla world streamed 153 cached partitions,
113 resident mesh parts and 51,776 resident triangles, with no degraded meshes,
no untextured visible groups and an empty render queue. The last 1,000 bridge log
rows contained 998 successful HTTP requests (997 status 200, one status 201),
and no request errors. These are local observations, not a WAN/load benchmark.

The Studio cutout comparison showed black holes at MeshPart transparency 0 and
visible leaf gaps at 0.02, retaining the same atlas and vertex tint. All 39 visible
cutout parts used the corrected path after source sync and a fresh playtest.
The stationary 2,400-frame sample had p95 5.61 ms and p99 6.43 ms; total Studio
memory was about 2.93 GiB. No paired performance gain or device parity is claimed.
Temporary diagnostic images/lights were removed, and world time was restored
after the daylight visual comparison. Soft transparency can affect sorting and
occlusion; full Minecraft light propagation remains unimplemented.

## Remaining work

Recipe book, full creative categories, creative/spectator flight, effects/vehicles,
all containers, all mobs/equipment, exact biome tint, model uvlock/rescale,
animated/sloped fluids, per-block light/AO, weather/Nether/End skies, far terrain
LOD and repeated forest/device/multiplayer/WAN measurements remain incomplete.
Runtime Minecraft texture sampling still differs from native Java; the atlas's
8x copy is a filtering workaround. Public authentication/account linking,
licensed assets and published runtime validation still block a production claim.
