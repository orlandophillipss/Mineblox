# Rendering decisions under Roblox constraints

The frontend owns visibility and presentation; Minecraft owns world state.
Camera changes never issue terrain requests. Sources are the official
[EditableMesh](https://create.roblox.com/docs/reference/engine/classes/EditableMesh),
[MeshPart](https://create.roblox.com/docs/reference/engine/classes/MeshPart),
[EditableImage](https://create.roblox.com/docs/reference/engine/classes/EditableImage),
[RunService](https://create.roblox.com/docs/reference/engine/classes/RunService),
and [microprofiler](https://create.roblox.com/docs/performance-optimization/microprofiler).

| Technique                        | Applicability and decision                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greedy meshing / batching        | Applicable, implemented for compatible cube states. Each texture has a mesh batch with block-scale repeating UVs. Model geometry uses the same bounded partition lifecycle.                               |
| Dirty-region rebuilding          | Applicable. Block changes invalidate the containing partition and relevant boundary neighbors. One-face halos remove internal border faces.                                                               |
| Spatial partitioning             | Applicable. A bounded regular voxel grid supplies cache, collision, rendering and interest keys; no separate octree/BVH is needed for this scale.                                                         |
| Frustum culling / temporal reuse | Applicable. Conservative partition spheres tested at 10 Hz. Meshes are retained and temporarily detached, avoiding repeated asset creation on rotation.                                                   |
| Occlusion / PVS                  | Partially applicable. Roblox handles its own rendering occlusion; reliable custom visibility cannot be inferred from a few sparse rays. No custom opaque-portal/PVS implementation is claimed.            |
| Hierarchical culling             | Partially applicable. Can group partitions at larger distances if measurements show the linear bounded set is expensive. Not added speculatively.                                                         |
| Mesh caching / residency         | Applicable. Revision caches and separate client voxel data preserve knowledge when geometry is outside view. Cache capacity is explicit.                                                                  |
| Predictive streaming             | Applicable. Server-known velocity prioritizes the outer interest ring while retaining a safety radius. Rotation adds no RPC.                                                                              |
| Async work / budgets             | Applicable. Server meshing uses a bounded worker; client texture-batch uploads yield between batches. A single API upload remains indivisible, so strict maximum frame cost is not guaranteed.            |
| Pooling                          | Partially applicable. Glyphs are pooled. Mesh replacement cannot simply reuse a resizable backing mesh without worsening the observed EditableMesh memory budget; fixed-size meshes are retained instead. |
| Atlases                          | Partially applicable. Arbitrary UV repetition cannot repeat only one atlas cell. Material-specific images avoid bleed and preserve greedy merges. No atlas is used.                                       |
| GPU instancing / custom shaders  | Unsuitable through these exposed APIs. No claim of user-controlled draw calls, nearest texture samplers or engine-level batching.                                                                         |
| LOD / impostors                  | Partially applicable. Require a validated representation and transition policy; presently outside the bounded useful range geometry is unloaded. No fabricated distant-detail implementation.             |
| Entity activation                | Rendering-only applicability. Timed state knowledge is retained while visuals are culled; Minecraft AI never stops based on a Roblox camera.                                                              |

SurfaceAppearance now exposes Pixelated sampling and tinting. Native-resolution
sampling remained blurred in the tested Studio viewport, so the renderer retains
8x nearest source enlargement. AlphaMode.Transparency supplies foliage cutouts;
changing the whole part transparency does not substitute for that alpha mode.
Leaf faces behind other leaf cutouts are retained, unlike same-glass culling.

FPS/latency before-after comparisons must use the same world, camera, render
settings and frame cap. The initial stationary samples changed scene and frame
cap, so they are records, not evidence of a fourfold optimisation. Paired culling
measurements and expanded terrain timings are recorded separately.
