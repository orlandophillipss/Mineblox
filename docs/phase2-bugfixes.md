# Phase 2 bug-fix validation — 2026-10-08

## October 10 continuation

Beta 8 adds category browsing with a five-row creative grid, actual hotbar writes,
scroll offsets and stale catalog-response checks. Category membership/order is
approximate for the pinned registry; search retains every registry item. The
reference's modded/older pagination and exact vanilla creative organization are
not reproduced. Compiler-generated private GUI images replace 3D icon templates.
An isolated Studio test loaded all 64 catalog icons with zero mesh icons and zero
remaining loading placeholders. Text remains for unsupported special models.
Slot/tab bevels and a carried-preview cleanup are included.

Held items use compiled first-person translation/rotation/scale and extruded
opaque sprite edges. A Studio axe probe was visually compared with the supplied
reference; the generic flat-card angle/scale is removed. Specialized bow charging,
maps, shields, offhand and equip transitions remain incomplete. Item templates
are capped at 32 for world/held presentation, replacing the earlier 128 GUI cap.

Terrain now reuses one serial growth buffer and shares exact-coordinate vertices,
UVs and colours within each frozen batch. GUI icons no longer consume mesh budget.
In the user's running scene after this change: 243 cached partitions, 314 MeshParts,
53,848 resident triangles, zero degraded partitions, three item templates and an
empty queue. The rolling 2,400-frame sample measured 5.52 ms p95, 6.11 ms p99 and
240.02 average FPS. Total Studio process memory was 4,336.88 MiB; this is not
incremental renderer memory or proof of a device/WAN budget. Allocation failures
still retain labelled degradation and retry, rather than generating per-block Parts.

The launcher interest radius is now 4 (previously 2), bounded to 2..4 partitions
in each horizontal direction; each partition is 8 voxels wide. This is a local
near-field improvement, not a long-distance Minecraft renderer or LOD solution.
The existing staged build acknowledgements and canonical voxel cache remain.

Full-opacity placement previews add a separately owned collision/targeting overlay
for verified cubes. Server rejection, expiry and matching rendered revisions
retire it. Placement confirmation is serial; mature Mineflayer placement sends
the validated surface hit without fighting the movement look stream. Unit tests
verify ordering, ownership, bounds and cleanup. Full native jump-build latency
and orientation prediction still need real multiplayer/WAN comparisons.

A five-second stationary Studio sample recorded 1,200 camera frames with identical
first/last coordinates and zero backward/moving frames. This verifies the local
grounded idle correction case, not all collision or correction conditions.

Fluid corner heights now follow the pinned Java renderer's source-weighted height
calculation, with diagonal halo data and seam invalidation. Minecraft still owns
fluid spread. Fluid animation, all waterlogged models and every fluid/solid edge
case remain incomplete. Plant model preparation includes azalea/dripleaf/carpet
geometry; an isolated six-plant fixture produced 60 quads with no missing textures.
The final fixture reused 126 mesh vertices for those faces instead of 240
unshared face vertices. This is a geometry count, not a device memory benchmark.
Fish, arrow and zombie-villager rigs have explicit geometry/UVs. Fish patterns/dyes
and zombie-villager profession/biome variants remain incomplete.

Sun/moon black pixels receive private transparency conversion; clouds use cutouts,
and roof/water/dimension checks suppress celestial overlays. Authoritative eye
skylight distinguishes a shaded outdoor canopy from an unlit cave when selecting
fog/sky presentation. Ambient face illumination is still approximate.

The optional audio-bank compiler/runtime and measured limitations are documented
in [the audio guide](phase4-audio-banks.md). No Minecraft recordings are uploaded
or redistributed. These local checks do not establish production readiness,
complete model parity, memory stability under sustained travel or game completion.

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

## October 9 lighting and foliage follow-up

The initial soft-alpha workaround was replaced after a moving forest check
exposed sorting artifacts and a mesh-budget failure. An isolated alpha comparison
showed the opaque TextureContent underlay filled SurfaceAppearance holes. Cutouts
now omit that underlay, bake tint/shade in atlas cells and use depth testing at
transparency 0. Cube faces are single-sided; model cards retain both sides.
Leaf species share an occlusion family across state variants and partition halos,
while face merge keys and canonical voxels remain state-local. This approximates
an exterior canopy rather than retaining all native fancy-leaf interior faces.

The repeatable `npm run bench` leaf fixture emitted 384 unit faces rather than
3,072; median CPU meshing was 161.735 versus 175.545 microseconds. This is geometry
and CPU evidence, not a paired Studio FPS improvement. The final forest playtest
had 147 cached partitions, 195 mesh parts, 33,254 triangles, 33 atlas cells and zero
degraded partitions. All 35 visible cutout parts had the corrected binding. The
2,400-frame sample had p95 5.50 ms and p99 6.12 ms, with total Studio memory about
3.14 GiB. Its console showed no allocation errors. Details are in
[foliage-bugfix-2026-10-09.json](measurements/foliage-bugfix-2026-10-09.json).

The night ambient floor is raised from RGB 35/40/55 to 180/185/200, with white
daytime ambient and dark night sky/fog retained. This is a visual approximation,
including in caves, rather than server block/sky light. Preview overrides were
cleared by the fresh playtest. All 86 unit tests, two integration tests and the
JavaScript/Luau gates passed. Device budgets and larger forest walks still need
coverage; bounded fallback remains explicit if allocation fails elsewhere.

## October 9 respawn, entity and water follow-up

Terrain builders carry a generation across yielding mesh APIs. Resets cancel
stale work instead of allowing it to replace current partitions; the client
acknowledges completed builds only in the current session/epoch. A populated
atlas survives world resets when its catalog is unchanged. The private Studio
fixture in `tests/studio-render.luau` passed a reset during a real yielding build,
retained-pixel reads and a textured, double-sided water mesh. This addresses a
reset race, rather than proving every possible black-texture cause is resolved.

Entity geometry is a pure module with explicit supported species and skin bounds
checks. Serial, generation-scoped preparation retries allocation failures with
bounded backoff. Private skins cover 14 mob species plus the default player.
The gallery checked actual skin dimensions and Minecraft height scaling,
including the modern 32x32 bat and separate sheep wool. Creeper parts connect;
modern player left limbs use their own skin regions. Fallback animation restores
each part's original color instead of turning it white. Walk/flap cycles remain
approximate; sheep variants/shearing, babies, equipment, fish and other unsupported
species remain incomplete.

The personal inventory removes its overlapping Inventory heading and fits its
Steve preview to measured bounds, viewport aspect and field of view. Pure fit
and limb UV invariants passed; the private screenshot showed the full model with
margins. Existing serial inventory transactions are retained.

Water-containing plant and waterlogged neighbors no longer produce interior
walls. Loaded partition halos retain those states, and water above fills the
column. Double-sided surfaces are visible underwater. Fog checks the eye against
canonical fluid height, falling back to server swimming only in unknown terrain;
celestial panels/clouds are hidden while immersed. Minecraft still owns all
fluid simulation and world generation.

A separate spectator test player extracted the user's ocean without respawning
the dead user or changing inventory: 75 partitions, 701 aquatic plant voxels,
1,097 water quads and zero water faces into aquatic plants. An isolated Studio
probe rendered 21 water parts with no missing materials and visible overhead
surfaces. Probe geometry and camera overrides were removed. Source-height gaps
around plant surfaces, sloped/animated flow, waterlogged void geometry and exact
underwater sky/biome fog remain incomplete. All 89 unit tests, two real TCP tests
and JavaScript/Luau checks passed. Local worker roundtrip samples are recorded in
[water-entity-bugfix-2026-10-09.json](measurements/water-entity-bugfix-2026-10-09.json);
they are not paired CPU, FPS, WAN or device improvements.

## Remaining work

Recipe book, full creative categories, creative/spectator flight, effects/vehicles,
all containers, all mobs/equipment, exact biome tint, model uvlock/rescale,
animated/sloped fluids, per-block light/AO, weather/Nether/End skies, far terrain
LOD and repeated forest/device/multiplayer/WAN measurements remain incomplete.
Runtime Minecraft texture sampling still differs from native Java; the atlas's
8x copy is a filtering workaround. Public authentication/account linking,
licensed assets and published runtime validation still block a production claim.
