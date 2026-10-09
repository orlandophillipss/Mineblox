# Mineblox development protocol v1

Minecraft Java TCP packets are handled by the pinned upstream adapter; this
document describes the Roblox/gateway boundary and separate voxel experiment.
One trusted Roblox server may use one gateway. All HTTP requests require
`Authorization: Bearer <BRIDGE_TOKEN>`; secrets stay server-side. Use HTTPS when
leaving localhost. JSON is intentionally limited to the small control/input
spike; terrain is not embedded in gameplay exchanges. Optional Patch 2 fields
extend the control envelope. Terrain explicitly identifies its voxel schema.

Session creation accepts optional `username` and `displayName` from the trusted
Roblox server, derived from its Player object. Protocol usernames are capped at
16 characters; long Roblox names receive a stable shortened name and ID suffix.
Display aliases affect Roblox chat. `minecraftName`, username/displayName and a
bounded connected-player roster are returned in state.

## Endpoints

| Method/path                   | Request                                                                             | Response                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GET `/health`                 | authenticated                                                                       | protocol version and current session count                  |
| POST `/v1/sessions`           | `{ "version": 1, "robloxId": "123" }`                                               | 201 after live spawn or dead login; 15 s timeout            |
| PUT `/v1/sessions/<id>/input` | input frame below                                                                   | state plus acceptedSeq/processingMs                         |
| POST `/v1/exchange`           | `{ "version": 1, "inputs": [{ "id": "...", "frame": {...} }] }`                     | version and states array, per-entry error/status on failure |
| POST `/v1/terrain`            | `{ "version": 1, "players": [{ "id": "...", "epoch": 1, "known": {"x,y,z": 4} }] }` | separate world/partition snapshots, max four players        |
| GET `/v1/sessions/<id>/state` | authenticated                                                                       | current state; reading does not renew the session lease     |
| DELETE `/v1/sessions/<id>`    | authenticated                                                                       | `{ "closed": true }`                                        |

Requests are limited to 16 KiB; maximum 16 sessions/batch entries by default.
Each player has a 20-token input bucket replenished at 20 frames/second; floods
fail 429 without advancing the accepted input sequence.
Authenticated traffic has a 1,200 request/minute gateway-wide bound, separate
from Roblox's tighter external budget. Spawn/login reservations count toward
the session cap. Unknown fields, invalid content type/JSON, unsupported versions,
invalid identity/coordinates and stale sequences fail explicitly. HTTP 400/401/
404/409/413/415/426/429/502/504 distinguish relevant failure conditions.

A dead login may become ready without Mineflayer's alive `spawn` event once the
bridge receives server health at zero and a server position in protocol play
state. Its initial epoch is 1, and the snapshot retains zero health for the death
screen. The bridge does not respawn automatically; explicit Respawn input invokes
the normal Minecraft command and a later spawn advances the epoch. A login with
missing health/position still times out with HTTP 504 after 15 seconds.

## Input and clocks

```json
{ "version": 1, "seq": 1, "controls": 33, "yaw": 0.5, "pitch": 0.1 }
```

Sequence is an integer 1..2^32-1; reconnect with a new session before wrap. Only
strictly increasing values are accepted. Gaps are valid because full held-state
frames supersede older frames. Controls is a seven-bit mask: forward, back, left,
right, jump, sprint, sneak in bits 0..6. No movement destination is accepted.
Yaw is [-pi,pi], pitch [-pi/2,pi/2], both Mineflayer radians. Yaw 0 points -Z,
positive yaw points toward -X; positive pitch looks up.
Optional `slot` is an integer 0..8 and selects Minecraft's held hotbar slot.
It never supplies inventory contents.

acceptedSeq acknowledges bridge validation/application to the virtual client's
controls. It does **not** acknowledge Minecraft simulation or an accepted
position. `processingMs` measures local apply work, not HTTP RTT. `bridgeTimeMs`
is process-local monotonic time; compare within the same gateway lifetime only.
`predicted` is Mineflayer's normal client movement estimate; `correction` contains
the most recently received forced server position, revision and receive time.
Health/hunger come from server packets. Never interpret a missing correction as
server confirmation of every intervening predicted move.

Send fresh complete frames at least 5 Hz, including idle controls. Inputs that
arrive after newer frames fail 409. If a response is lost, a retry may return 409;
send a newer full frame and recover state. Discrete actions use their own unique
sequences and bounded result journal. Held controls stop after 750 ms without a new accepted input. Sessions
close after 30 seconds of inactivity. The CLI's leases differ for manual use.

HTTP exchange is shared/batched at 5 Hz for an entire Roblox server (300 requests/
minute), not 5 Hz per player. Never issue catch-up bursts. Back off on unavailable
gateway/Minecraft, renew via new input, and stop prediction if disconnected.
The server generates fresh delivery sequences at each exchange and stops controls
when Roblox client input is absent for 750 ms. Client input sequence checks are
separate from bridge delivery sequence checks. Camera/look input is local at render
rate; Roblox intention frames are sent at 20 Hz and gateway batches at 5 Hz.
State also includes velocity (blocks/tick), worldEpoch, nearby entities (max 128,
within 48 blocks), server health/food, hotbar, held slot and experience.
Patch 2 adds physics tick/jump cooldown, actual inventory window/slots/cursor,
bounded events and action results, entity dimensions/velocities and dropped-item
name/count. Empty inventory slots are `false` to preserve Luau array iteration.
Roblox annotates responses with stateSeq, observedClientSeq and local input time;
these describe bridge delivery/application, never Minecraft position acceptance.

Each exchange entry may include up to four `actions`, each with `seq`, `epoch`
and `kind`. Kinds: chat, complete, dig, cancelDig, place, useBlock, attack,
useEntity, click, closeWindow, drop, useItem, respawn. Unknown fields are rejected.
Targets/face vectors, live window IDs and slots, chat controls/length and entity
reach/occlusion are validated. Action results (pending/sent/rejected) are bounded;
`sent` means the library operation completed, not proof of all gameplay outcomes.
Use server state/events to inspect outcomes. Published external chat fails closed.

## Terrain streaming envelope

Terrain has its own 2 Hz budget and worker, separate from gameplay. Interest follows
the Minecraft player's position, never camera movement: default 75 partitions,
147 in the launcher, with a configurable radius 2–4, each containing 8^3
voxels, nearest first. The cache is per session/world epoch and bounded to active
interest. A session is bound to one Minecraft server and its current dimension.
Each response carries version, session id, epoch, dimension, active keys and up
to 16 full partition meshes per player within a 768 KiB payload bound. Quad arrays are
`[axis, sign, x, y, z, width, height, stateId, optionalModelFaceIndex]`, with a
material palette containing collision shapes and optional model face data.
Each partition includes 512 canonical `voxels`, independent from its mesh.
Legacy requests default to `state-u32-xzy-v1` for pinned Minecraft 1.21.4.
Requests may explicitly select `format: "state-adaptive-xzy-v2"`; unknown formats
return 426. In v2, `voxels` is `{encoding:"uniform",state}`, `{encoding:"rle",runs}`
or `{encoding:"array",values}`. RLE is a flat `[count,state,...]` array totaling exactly
512 cells; array values contain exactly 512 states. Both retain x/z/y order and unsigned
32-bit state IDs. Decode every partition before mutating the world cache.
Ordinary interest has three vertical bands; high players may additionally retain
three loaded ground bands per column. Maximum interest is six bands (486 partitions
at radius 4). This is bounded coverage, not full vertical terrain or distant LOD.

`known` is a dictionary of successfully rendered revisions, not an acknowledgement
of merely receiving a response. Omit it when empty: Roblox JSONEncode encodes an
empty table as an array. Client render acknowledgements update the trusted server's
revision dictionary. Lost/failed/dropped render work is resent as a snapshot;
leaving interest evicts a partition. Spawn/respawn/dimension changes increment the
epoch. Clients discard old session/epoch deliveries. Block edits invalidate the
affected partition and boundary neighbors. Chunk load/unload invalidates nearby
partitions. Mesh jobs invalidated during work are discarded. Meshes cap at 4,096
quads per partition; a full model/delta journal is future work.

Production reliable event journals, multi-server ownership and resume remain
unfinished. A bounded curated model catalog supplies variants/multipart geometry;
full model coverage, UV-lock, fluid slopes and waterlogging remain incomplete.

## Binary voxel experiment

MBVX v1 is a bounded full voxel-region snapshot; not yet a terrain HTTP API.
All integers are little-endian. It preserves pinned-version block state IDs,
not just block names. A future outer terrain envelope must carry Minecraft
version, dimension, world epoch and region identity before network use.

| Offset    | Field                                          |
| --------- | ---------------------------------------------- |
| 0         | 4 ASCII bytes `MBVX`                           |
| 4         | u16 format version = 1                         |
| 6         | u16 message kind = 1 (snapshot)                |
| 8,12,16   | i32 origin x,y,z                               |
| 20        | u32 revision                                   |
| 24,26,28  | u16 dimensions x,y,z, each 1..64               |
| 30        | u16 reserved = 0                               |
| 32 onward | u32 block state IDs; x fastest, then z, then y |

Exact length is `32 + 4 * sx * sy * sz`, maximum 1,048,608 bytes. Parsers reject
truncation, trailing bytes, bad magic/version/kind, reserved flags and invalid
dimensions before allocation. Unit tests include a deterministic fuzz corpus.
16^3 is 16,416 bytes uncompressed; this is a correctness baseline, not a claim
that raw u32 is the best production encoding. Compare palette packing,
compression, MessagePack and protobuf only with Luau decoding/runtime evidence.

The in-memory delta schema is `{ base, revision, changes: [{x,y,z,state}] }`.
revision must equal base+1. If base matches, validate every change first and
apply atomically. Already-applied revisions return `stale`; a gap returns
`resync` without mutation. Replace with a fresh snapshot if history is missing;
never apply a later revision speculatively. Revision overflow requires a new
epoch/snapshot. Network delta encoding and journals are future work.
