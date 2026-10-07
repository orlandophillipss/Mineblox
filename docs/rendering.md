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

## Shipped local Studio renderer

The terrain worker emits bounded 8^3 partition meshes. The Roblox client groups
greedy faces by texture, creates block-scale repeated UVs and freezes completed
EditableMeshes using CreateEditableMeshAsync with FixedSize=true. Retained dynamic
meshes hit the client memory budget in the normally generated world; fixed-size
meshes eliminated that observed failure. Parts and their backing meshes are
destroyed together on replacement/eviction. Empty partitions allocate no meshes.
Vertices are centered in mesh object space before placing the MeshPart at its
world center; a live viewport check caught and corrected duplicated translation.
Ambient light keeps the local preview readable at night; it is not Minecraft
light propagation.

The real development textures/HUD sprites are loaded from private pixel data
into EditableImages; no image is uploaded to Roblox. Device allocation failure
uses an explicitly logged greedy-face Part fallback. That path is bounded by
partition quad limits but may be expensive and uses substitute colors.

The local generated forest has been inspected with textured meshes and real HUD
sprites. This does not cover every Minecraft material: the development catalogue
contains common blocks, including the observed dark-oak and mushroom materials.
Collision shapes approximate unsupported non-cube visuals; full blockstate,
multipart, rotated-model, fluid, biome-color and lighting parity is unfinished.

## Remaining runtime work

Start with 16^3 voxel sections and test 8^3/16^3 mesh partitions. Rebuild only the
changed partition and boundary neighbors. Track mesh generation and upload
separately. Keep a pool, cap work/frame, cancel stale mesh jobs by revision and
cap client memory/instances. Merge key must include face texture, state/orientation,
transparency, geometry, relevant lighting/tint and UV policy before actual assets
are used. The current simple keys don't implement those production policies.

EditableMesh's documented limits require splitting by triangles/vertices, not
merely by Minecraft chunk: worst-case checkerboards can exceed a single mesh.
Budget below limits, handle allocation failure, cull frustum/distance locally,
and test devices. LOD/occlusion are later measured extensions. Minecraft interest
regions follow player world movement; camera rotation must not request terrain.

## Textures/models

AssetStore can resolve vanilla model parents and texture aliases and retrieve
blockstates/textures. A renderer still needs variant/multipart selection, model
rotations, element faces, uvlock, cullface, transparency, biome tint, animation
and item-model rules. Never silently render every block as a cube in a supported
gameplay experience.

Merged UVs must repeat at one texture tile per Minecraft block. UV coordinates
outside 0..1 may work with a repeating standalone texture, but a conventional
atlas will sample adjacent tiles rather than repeat one atlas cell. Verify Roblox
sampling first; choose material-specific textures, a supported repeat strategy,
or subdivided tiled UV geometry. Padding/mip behavior also need device tests.
Asset uploads need Roblox content permission and appropriate usage rights.
No HTTP image URL is assumed usable as a MeshPart texture ID.
