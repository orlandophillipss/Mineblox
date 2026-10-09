# ADR 0006: bounded atlas, item metadata and client transactions

This supersedes ADR 0003's decision to avoid an atlas. No dependency, second
gateway or gameplay authority is added. Minecraft Java 1.21.4 and the pinned
Mineflayer/Prismarine libraries still own simulation and inventory outcomes.

The renderer batches by atlas page and render layer instead of texture. A
1024-pixel page allocates cells lazily, with 128-pixel nearest-copied tiles and
four-pixel gutters. Greedy quads are subdivided at block boundaries before UVs
are mapped into a cell: ordinary UV repeat cannot safely repeat one atlas cell.
This trades extra triangles for fewer material batches. The controlled flat
scene has about 50 resident mesh parts; it is not a paired forest performance
comparison. Fixed-size meshes, cooperative upload work, allocation retries and
the maximum 16-face degraded preview remain required. GPU sampling/device parity
is not established by setting SurfaceAppearance.ResampleMode.Pixelated.

The October 9 Studio forest check exposed black cutout pixels with the depth-only
alpha path. Cutout batches now use MeshPart transparency 0.02, the documented
soft-alpha path, retaining vertex tint and the shared atlas. Water remains 0.25
and opaque batches remain opaque. Soft blending has sorting/occlusion tradeoffs;
this local fix does not establish mobile or published-client rendering parity.
See [SurfaceAppearance alpha modes](https://create.roblox.com/docs/reference/engine/classes/SurfaceAppearance#AlphaMode).

Canonical terrain uses negotiated `state-adaptive-xzy-v2`: uniform state, RLE or
512 u32 states. The client decodes into a number or a compact buffer. Legacy
requests still receive arrays. Revision/epoch checks and snapshot recovery remain.
Worker generation tokens discard intersecting stale builds, not every unrelated
job. High players additionally retain bounded bands from loaded column metadata;
this is not full-height streaming or distant LOD.

Build-time item conversion reads the real 1.21.4 client item definitions and model
inheritance. GUI geometry, generated sprite layers and explicit unsupported-model
reports replace guessed top-face icons. World, GUI, drops and placement previews
share the catalogue. Item mesh templates have an LRU cap of 128 and reference
counts so live icons never refer to an evicted backing mesh. Private pixels and
models stay ignored. Content format 2 permits bounded geometry referring only to
permitted Roblox images; it retains format 1 compatibility and the 64 KiB limit.

Inventory intentions are serial, with bounded queues and timeouts. Modes missing
from pinned prismarine-windows prediction use vanilla window_click packets and
wait for full server replies. State -1 requests resynchronization; no frontend
stack outcome is trusted. Live vanilla tests covered distribution, splitting,
closing a carried stack and crafting-table result pickup. This adapter must be
reverified for a Minecraft/library version change.

Movement acknowledgements mean accepted intentions, not completed server physics.
The short local jump arc survives ordinary delayed snapshots; forced corrections
and large discrepancies still replace it. A short jump press is latched until
the next accepted exchange. Held mining/placement use bounded repeats; placement
ghosts neither alter canonical voxels nor collision and retire on confirmation,
rejection or timeout. Dropped items are excluded from combat rays and rejected
as attack targets on the server to avoid vanilla invalid-entity disconnects.

Roblox direct solar lighting caused the observed broad white ground highlight.
The sky controller disables direct brightness and post effects, uses approximate
day/night ambient illumination, and meshes apply directional face shades. This
does not implement Minecraft block/sky light propagation. Original project sky
gradients are uploaded; no Minecraft image or recording is uploaded.

Sources: [Minecraft 1.21.4 item definitions](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-4),
[version-specific model format](https://docs.neoforged.net/docs/1.21.4/resources/client/models/),
[SurfaceAppearance](https://create.roblox.com/docs/reference/engine/classes/SurfaceAppearance),
[EditableMesh](https://create.roblox.com/docs/reference/engine/classes/EditableMesh),
[Mineflayer inventory source](https://github.com/PrismarineJS/mineflayer/blob/master/lib/plugins/inventory.js).
