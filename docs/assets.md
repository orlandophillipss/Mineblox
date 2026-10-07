# Assets and mcasset.cloud

The user suggested mcasset.cloud; the repository includes a working optional
development adapter. It uses the current site's
[source endpoint](https://github.com/InventivetalentDev/mcasset.cloud/blob/main/query/assets.ts):

```text
https://assets.mcasset.cloud/1.21.4/assets/minecraft/models/block/stone.json
https://assets.mcasset.cloud/1.21.4/assets/minecraft/blockstates/stone.json
https://assets.mcasset.cloud/1.21.4/assets/minecraft/textures/block/stone.png
```

Model JSON, blockstate JSON and PNG endpoints each returned HTTP 200 in a direct
check. The implemented CLI also retrieved the stone model to ignored local cache.
This is a static/versioned file endpoint; no published SLA or API quota guarantee
was established. Do not fetch assets in player input handlers or per camera frame.

## Usage

```sh
npm run assets -- --remote --version 1.21.4 assets/minecraft/models/block/stone.json
npm run assets -- --remote --version 1.21.4 assets/minecraft/textures/block/stone.png
npm run assets -- --local /path/to/extracted-root --version 1.21.4 assets/minecraft/blockstates/stone.json
```

Local root contains `assets/minecraft/...`. Omit --remote to require cached or
user-provided files. Cache lives under `.local/assets/<version>` and is gitignored.
Exact stable 1.x.y versions are currently accepted; aliases such as latest/master
are rejected to prevent silent changes. Future version naming requires an
explicit validated extension, not removal of pinning.

Every cached file has metadata for source/version/path/bytes/SHA-256. Cache reads
validate the hash; corruption fails explicitly. Remote requests use TLS, a
10-second timeout, no redirects, content type/signature/JSON checks and a 2 MiB
limit. Hashes detect cache corruption, not malicious changes at the original
provider. There is no trusted upstream manifest pin or persistent cache quota
yet; plan those before broad bulk import. Offline cached reads remain usable.

AssetStore.model resolves bounded parent inheritance and merges texture mappings;
resolveTexture resolves bounded #aliases. This does not yet convert Minecraft
models into Roblox geometry. Blockstate variants, multipart rules, animated PNG
strips, biome color maps and custom resource-pack namespaces need a later slice.
The provider intentionally supports only minecraft models/blockstates/textures
paths, not arbitrary remote URLs or Minecraft gameplay data.

## Private Studio development pixels

`Mineblox.bat -MinecraftAssets` prepares the pinned real Minecraft texture/HUD
set. PNGJS decodes only images with bounded dimensions, checked before decode.
`DevelopmentAssets.luau` is generated under ignored `.local/roblox` and embedded
only in the private generated place. The client creates EditableImages from RGBA
pixels; block meshes use TextureContent and HUD labels use ImageContent. Nothing
is uploaded to Roblox. The visible generated forest's common block materials
and actual hearts, hunger, hotbar, selection, crosshair and experience sprites
have been tested locally. The catalogue is not a complete Minecraft asset/model
implementation. Missing optional assets retain explicit substitute-color diagnostics.

## Rights and Roblox import

mcasset.cloud's site source is MIT, while its
[underlying asset repository](https://github.com/InventivetalentDev/minecraft-assets)
states that the files are extracted from Minecraft JARs. An accessible URL is
not a redistribution license. Review the
[Minecraft EULA](https://www.minecraft.net/en-us/eula) and
[usage guidelines](https://www.minecraft.net/en-us/usage-guidelines) for the
specific intended use; no permission to redistribute vanilla assets is assumed.
The project's MIT license applies to its own code only.

Commit no downloaded textures, models, server JARs, atlases or generated derivatives
containing proprietary assets. Use user-provided assets or independently licensed
substitutes for redistributable examples. The tests create synthetic JSON/content.
Roblox texture/mesh upload, moderation, ownership/access and runtime content rules
are separate checks; the mcasset.cloud URL is not automatically a Roblox asset ID.
No assets have been uploaded to Roblox by this run.
