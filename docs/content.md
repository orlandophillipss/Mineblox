# Versioned content updates

Copy `content/catalog.example.json` to `.local/content/catalog.json` and populate
it with image asset IDs you own or are permitted to use in the Roblox experience.
The format uses named image keys, six block-face references in west/east/down/up/
north/south order, and GUI/item/entity image references. For example:

```json
{
  "format": 1,
  "version": "1.0.0",
  "images": {
    "my-stone": { "assetId": "rbxassetid://123456", "alpha": false }
  },
  "blocks": {
    "stone": [
      "my-stone",
      "my-stone",
      "my-stone",
      "my-stone",
      "my-stone",
      "my-stone"
    ]
  },
  "gui": {},
  "items": {},
  "entities": {}
}
```

The example ID is illustrative, not a permitted bundled texture. Pixel scaling
must be prepared in the uploaded image. GUI keys match the current HUD roles,
such as `heartFull`, `heartHalf`, `heartEmpty`, `hotbar`, `selection`, `crosshair`,
`experienceBack`, and `experienceFill`.

The host checks the file every 60 seconds. Published Roblox servers check the
authenticated `/v1/content` endpoint every 60 seconds and send changed catalogs
to connected clients. Bump the semantic version for every change; unchanged
versions with different contents are rejected. Invalid updates keep the last
valid catalog. A catalog is limited to 64 KiB and 512 entries per map; executable
scripts and raw pixel data are rejected.

On a changed pack, clients clear terrain visuals and request fresh partition
snapshots through bounded acknowledgements. Item/entity imagery and existing HUD
sprites refresh. Adding a HUD role that was absent at client creation needs a
rejoin. Core UI/scripts, gameplay rules, Minecraft version and expanded block
model geometry require a code/place release rather than a catalog edit.
This pipeline never executes remotely supplied code or replaces Minecraft's
authoritative generation/gameplay.

Larger content updates should get a new catalog version and a changelog entry,
plus a new ZIP/code release when code changes are involved. Keep private assets,
worlds and credentials out of the release. Upgrade code by extracting a new ZIP,
stopping/backing up the host, and preserving the existing `.local` directory
before running the new manager. Read compatibility notes before using an older
release on a newer save. Minecraft save upgrades are not automatically reversed.
