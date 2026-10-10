# ADR 0008: optional offline audio banks and GUI icon compilation

Status: accepted for local development, 2026-10-10.

Roblox limits editable mesh allocation independently of process RAM. Creating
3D GUI icons competed with terrain, reproduced indefinite loading placeholders,
and increased the risk of missing world geometry. Compile supplied item models
into private 32-pixel GUI images during asset preparation. Preserve live meshes
for world models and held items. Reuse one serialized growth buffer and deduplicate
terrain vertices, UVs and colours before freezing completed meshes. This adds no
dependency and does not make the platform allocation budget unlimited.

An optional audio compiler invokes locally installed FFmpeg/ffprobe to decode,
measure, pack and verify permitted recordings. These mature tools provide actual
sample counts, codec handling and export validation; reimplementing codecs in
Node would increase complexity and risk. They run offline, are not additional
gateway services, and are not redistributed in the release. The default Creator
Store effects work without either executable or an uploaded bank.

FLAC banks preserve decoded PCM exactly and include silence padding. Streamed
and music recordings remain separate assets. Native AudioPlayer PlaybackRegion
and bounded cleanup guard bank slices; runtime fallback preserves existing effects
when a bank is unavailable. Roblox transcoding, WAN startup, audible boundaries,
device memory and subjective quality still require uploaded permitted banks.
No sample-accurate Roblox playback or production equivalence is established.

References: [EditableMesh](https://create.roblox.com/docs/reference/engine/classes/EditableMesh),
[AudioPlayer](https://create.roblox.com/docs/reference/engine/classes/AudioPlayer),
[audio import requirements](https://create.roblox.com/docs/audio/assets).
