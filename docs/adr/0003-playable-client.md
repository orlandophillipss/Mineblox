# ADR 0003: playable local Minecraft frontend

Patch 2 extends the existing Node/Mineflayer gateway and shared HTTP budgets.
Minecraft continues to own outcomes. Roblox sends bounded, sequenced intentions
and discrete actions, never player positions or inventory/block results.

Prediction is a local display model using streamed collision shapes. It reuses
the ordinary movement constants and collision approach of the pinned
Prismarine physics implementation, with explicit limitations for special blocks,
effects and vehicles. Input acknowledgement means bridge application, not a
Minecraft position acknowledgement. ForcedMove corrections remain separate.

SurfaceAppearance exposes ResampleMode.Pixelated in the current API and Studio
accepted the setting, but native-resolution textures still appeared blurred in
the tested viewport. Enlarge development block pixels 8x with nearest-neighbour
copies to narrow filtering transitions. Cutout foliage/plants use an alpha-mode
SurfaceAppearance with its own color tint; opaque meshes keep TextureContent.
Retain engine mipmapping and avoid an atlas. GUI images and bitmap glyphs use
ResamplerMode.Pixelated. This workaround does not establish exact Java sampling.

The camera interpolates fixed 20 Hz prediction steps at render rate, rather than
extrapolating each frame from a task.wait loop. Snapshot reconciliation preserves
small display offsets; errors remain measurable. Full movement parity under all
Minecraft effects, fluids and block types remains unfinished.

Effects use tested Creator Store IDs plus bundled substitutes. Optional audio
imports use Node's existing multipart HTTP APIs and Roblox Open Cloud; no new
dependency or separate runtime is added. Require user upload rights and a local
scoped API key. Never infer rights from owning Minecraft or the asset provider.

Use bounded action IDs and deduplication for discrete actions. Never retry a
timed-out inventory click or world action as a new action: return its existing
status and resynchronize from Minecraft. Player identity and permissions remain
server derived. Chat filtering must fail closed in published Roblox servers;
the local offline Studio path is explicitly separate.

Sources: [MeshPart](https://create.roblox.com/docs/reference/engine/classes/MeshPart),
[EditableImage](https://create.roblox.com/docs/reference/engine/classes/EditableImage),
[Prismarine physics](https://github.com/PrismarineJS/prismarine-physics),
[Mineflayer API](https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md),
[Roblox text filtering](https://create.roblox.com/docs/ui/text-filtering),
[audio assets](https://create.roblox.com/docs/audio/assets).
