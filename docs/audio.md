# Audio in the local client

The default effect mappings use Creator Store assets that loaded in the tested
Studio account: [button click](https://create.roblox.com/store/asset/8919449656),
[classic hurt](https://create.roblox.com/store/asset/535690488),
[stone step](https://create.roblox.com/store/asset/8031019470), and
[grass step](https://create.roblox.com/store/asset/137891923918460).
The names describe the catalog listings; a successful load does not prove
bit-identical Minecraft recordings. Other events use engine-bundled substitutes.
Current music searches returned no verified identical usable track. Music starts
only when permitted IDs are supplied. Original Minecraft audio is not uploaded.

`/sound on|off` controls effects; `/music on|off` controls the configured playlist.
Store mappings in ignored `.local/audio.json` with `sounds` (event key to
`rbxassetid://...`) and `music` (array of IDs). The batch launcher embeds this
configuration into the private place. Each list is bounded to 32 entries.

## Import permitted recordings

Use Roblox's [Open Cloud Assets API](https://create.roblox.com/docs/cloud/guides/usage-assets)
with a locally supplied `ROBLOX_OPEN_CLOUD_KEY` environment variable scoped for
Assets read/write. No session cookies are read. Studio MCP exposes image upload,
but the installed version has no audio upload tool. The importer uses Node's
built-in multipart HTTP support and introduces no dependency or second service.

Create ignored `.local/audio-import.json`:

```json
{
  "rightsConfirmed": true,
  "creatorType": "userId",
  "creatorId": "YOUR_ROBLOX_USER_ID",
  "assets": [
    {
      "name": "oak_button_click",
      "file": "permitted-audio/button.ogg",
      "kind": "sound",
      "key": "ui"
    }
  ]
}
```

Use `groupId` for group ownership. File paths resolve relative to the manifest.
For a music entry, set `kind` to `music`; omit `key`. Preview with
`node tools/import-audio.js`; add `--upload` to create the reviewed assets.
Alternatively `Mineblox.bat -ImportAudio` imports the reviewed manifest and then
starts everything with the resulting mappings. Plain double-click never uploads.
The importer records operation IDs before polling, resumes pending operations
and reuses completed uploads of the same content/name/creator. Asset IDs are
merged into `.local/audio.json`; restart `Mineblox.bat` to embed them.
Do not remove the upload journal when resuming an interrupted import.

Roblox enforces moderation, upload quotas, duration/sample-rate limits and
experience permissions. Audio must meet its [audio import requirements](https://create.roblox.com/docs/audio/assets),
including upload rights. An API ID alone does not establish playback permission.
This implementation has been checked with an injected HTTP fixture; external
audio creation remains unverified until an authorized creator supplies a key.
