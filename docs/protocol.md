# Mineblox development protocol v1

Minecraft Java TCP packets are handled by the pinned upstream adapter; this
document describes the Roblox/gateway boundary and separate voxel experiment.
One trusted Roblox server may use one gateway. All HTTP requests require
`Authorization: Bearer <BRIDGE_TOKEN>`; secrets stay server-side. Use HTTPS when
leaving localhost. JSON is intentionally limited to the small control/input
spike; terrain is not embedded in gameplay exchanges.

## Endpoints

| Method/path                   | Request                                                         | Response                                                    |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| GET `/health`                 | authenticated                                                   | protocol version and current session count                  |
| POST `/v1/sessions`           | `{ "version": 1, "robloxId": "123" }`                           | 201 session state after spawn; 15 s timeout                 |
| PUT `/v1/sessions/<id>/input` | input frame below                                               | state plus acceptedSeq/processingMs                         |
| POST `/v1/exchange`           | `{ "version": 1, "inputs": [{ "id": "...", "frame": {...} }] }` | version and states array, per-entry error/status on failure |
| GET `/v1/sessions/<id>/state` | authenticated                                                   | current state; reading does not renew the session lease     |
| DELETE `/v1/sessions/<id>`    | authenticated                                                   | `{ "closed": true }`                                        |

Requests are limited to 16 KiB; maximum 16 sessions/batch entries by default.
Each player has a 20-token input bucket replenished at 20 frames/second; floods
fail 429 without advancing the accepted input sequence.
Authenticated traffic has a 1,200 request/minute gateway-wide bound, separate
from Roblox's tighter external budget. Spawn/login reservations count toward
the session cap. Unknown fields, invalid content type/JSON, unsupported versions,
invalid identity/coordinates and stale sequences fail explicitly. HTTP 400/401/
404/409/413/415/426/429/502/504 distinguish relevant failure conditions.

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
send a newer full frame and recover state. Do not apply this retry rule to future
discrete attacks/digging: those require unique action IDs and bounded result
journals. Held controls stop after 750 ms without a new accepted input. Sessions
close after 30 seconds of inactivity. The CLI's leases differ for manual use.

HTTP exchange is shared/batched at 5 Hz for an entire Roblox server (300 requests/
minute), not 5 Hz per player. Never issue catch-up bursts. Back off on unavailable
gateway/Minecraft, renew via new input, and stop prediction if disconnected.
Production event sequencing, tick IDs, terrain endpoints, session ownership,
resume, world epochs and dimension resets are not implemented in v1.

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
