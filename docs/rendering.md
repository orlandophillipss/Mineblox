# Rendering groundwork

Minecraft voxels, Roblox render geometry and Minecraft gameplay remain separate.
The shipped mesher emits cube-face quads after hidden-face elimination and greedy
merging; it does not create Roblox instances. Solid adjacent identical cubes
collapse into six rectangular quads. Different merge keys stay separate. A
64×1×64 plane also becomes six quads rather than 4,096 block Parts.

Quad fields are axis, sign, world origin, width, height and material key. The
in-plane axes are `(axis+1)%3` and `(axis+2)%3`; winding follows sign. Each quad
becomes two triangles. A material callback decides air, opacity and face-specific
merge identity. Default behavior treats state 0 as air and all other states as
opaque cubes: **a test preview only**, incorrect for stairs, water, plants and
other non-cube/transparent models. A neighboring-world sampler can cull faces
across region boundaries; unknown neighbors default to air and must remesh on load.

Tests cover cube/adjacent/stacked blocks, large plane, hole, different materials,
transparent same/different boundaries, negative origin, neighbor boundaries and
random worlds compared to an independent exposed-unit-face reference.

## Current local Studio renderer

The worker emits bounded 8³ partitions. The client batches by atlas page and
opaque/cutout/water layer, then freezes completed EditableMeshes with FixedSize.
Canonical voxels use compact buffers or a uniform value independently of meshes.
GPU allocation failure retains previous geometry where possible; an explicitly
labelled preview is capped at 16 faces and retries after a delay.

Lazy 1024-pixel atlas pages contain 128-pixel nearest-copied tiles with four-pixel
gutters. Greedy quads split at voxel boundaries so UVs repeat inside the correct
cell. This adds triangles while reducing per-texture mesh batches. Both opaque
and alpha appearances request pixel sampling; engine mip/filtering still differs
from native Java. See ADR 0006 for the measured tradeoff and platform references.

Build/upload work yields after roughly 3–4 ms. Generations/revisions discard stale
worker results. Responses carry up to 16 partitions within 768 KiB. Interest
follows the player, including bounded loaded-ground bands for high players;
camera rotation performs only local visibility checks. Cached terrain can still
arrive later than gameplay, and the system is not full-height streaming or LOD.

Models select variants/multipart definitions, parents, face UVs and block rotations.
Partial faces preserve texture scale and rotated cullfaces hide against opaque
neighbors. Common stairs/slabs/walls/doors/panes/plants are prepared separately
from all item icons. Unknown models remain observable substitutes. UV-lock,
rescaled element rotations, exact biome tint, fluid slopes/animation and full
coverage remain unfinished.

The sky controller removes default photographic sky, clouds and post effects.
Original gradients plus private square celestial/cloud textures provide the local
presentation. A projected sky cloud plane preserves angular size/UV motion while
avoiding global distance fog erasing it. Direct engine solar illumination is
disabled after its plastic glare was reproduced; vertex directional shade and
approximate ambient day/night remain. This is not block/sky light propagation,
ambient occlusion, weather or dimension parity.

The final controlled flat scene has 147 cached partitions, 50 resident mesh parts,
12,720 triangles and zero degraded partitions. This is not a paired forest speedup
or device-budget guarantee. See [bug-fix validation](phase2-bugfixes.md).
