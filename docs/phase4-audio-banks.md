# Optional permitted audio-bank workflow

The existing Creator Store effects remain the default. This compiler accepts a
Minecraft-shaped event description and recordings the operator is allowed to
upload. It does not obtain or license Minecraft recordings. All inputs, encoded
banks, manifests and Roblox IDs stay in ignored `.local` output.

Install FFmpeg and ffprobe on PATH, or set `FFMPEG_PATH` and `FFPROBE_PATH`.
Create `.local/audio-bank-config.json`:

```json
{
  "rightsConfirmed": true,
  "sourceRoot": ".local/permitted-pack",
  "soundsJson": ".local/permitted-pack/assets/minecraft/sounds.json",
  "namespace": "minecraft",
  "output": ".local/audio-banks",
  "sampleRate": 48000,
  "channels": 1,
  "paddingSeconds": 0.3,
  "creatorType": "userId",
  "creatorId": "YOUR_ROBLOX_USER_ID"
}
```

Sound files resolve under `sourceRoot/assets/<namespace>/sounds/<name>.ogg`.
Nested event references, weights, volume, pitch, attenuation distance and stream
flags are resolved with bounded nesting and cycle detection. Paths cannot escape
the selected source tree. Music and streamed samples use standalone assets;
ordinary samples are grouped by category into FLAC banks. Defaults cap each bank
at 418 seconds and 19.9 MB. Exported duration and decoded frames are measured,
and FLAC PCM is compared against the concatenated source PCM.

```sh
npm run audio:compile -- .local/audio-bank-config.json
npm run audio:import -- .local/audio-banks/import-1.json
```

The second command previews the generated batch of at most 32 assets. Add
`--upload` only for permitted recordings and an operator-supplied
`ROBLOX_OPEN_CLOUD_KEY` with Assets permissions. Process additional `import-N.json`
batches in order. The importer verifies the compiled bank hash, journals pending
operations and writes completed IDs into the bank manifest. Playback permissions
and moderation must also allow the target experience to use the assets.

Alternatively bind IDs for already uploaded banks:

```sh
npm run audio:bind -- .local/audio-banks/manifest.json .local/audio-bank-ids.json
npm run roblox:build
```

The ID file maps bank IDs to strings such as `{"1":"rbxassetid://123456789"}`.
`MINEBLOX_AUDIO_BANK_MANIFEST` overrides the default manifest location. Build/sync
embeds bounded ModuleScript packs containing event, sample and bank metadata.
Keys and raw recording paths are never embedded. Missing IDs retain fallback
effects. Unavailable or busy bank voices fall back immediately instead of queuing
late sound effects.

The client maintains at most 16 AudioPlayer voices with wired spatial emitters
and a camera listener. Weighted variants preserve event parameters; native
PlaybackRegion, playhead checks and a speed-aware deadline stop slices. Commands:
`/sound on|off`, `/music on|off`, `/volume <category> <0..100>`. Categories are
blocks, players, ambient, weather, hostile, friendly, music, records and voice.
Compiled music is available through named events; a complete vanilla client music
scheduler is not implemented. Existing permitted playlist playback remains.

`npm run bench:audio` generates its own 32 short test tones, compiles them, and
writes an ignored comparison report. The measured local run produced one bank
instead of 32 separate assets: 87,138 bytes versus 121,024 bytes, 2,126.50 ms
compiler time, and byte-identical decoded FLAC PCM. This measures compilation,
not Roblox quality, frame-time or network performance.

A Studio API probe using an existing permitted effect verified that a 0.1–0.2 s
PlaybackRegion at half speed stopped natively while Heartbeat cleanup was disabled.
Sixteen pooled voices were created and destroyed; readiness took 151.85 ms in that
single probe. No compiled bank was uploaded. Sample accuracy, leakage after Roblox
transcoding, repeated seek fidelity, WAN readiness and low-end device costs remain
unverified. See [Roblox AudioPlayer](https://create.roblox.com/docs/reference/engine/classes/AudioPlayer)
and [upload limits](https://create.roblox.com/docs/audio/assets).
