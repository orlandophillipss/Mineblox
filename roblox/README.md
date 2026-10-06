# Roblox transport spike

`BridgeTransport.luau` is an experimental server-only module; it has not been
executed in Studio. It does not render Minecraft or provide local prediction.

Install it in ServerScriptService. Enable HTTP requests. Provision a secret in
Roblox's secrets store for the gateway domain and obtain it in a server Script
with `HttpService:GetSecret("MinebloxToken")`. The gateway needs an HTTPS reverse
proxy reachable from Roblox; localhost on the developer's PC is not reachable
from a published Roblox game server. Never put the secret in ReplicatedStorage
or a LocalScript. The gateway currently supports one trusted Roblox server.

Use `join(player)` from a server-verified PlayerAdded handler, `setInput(player,
frame)` from an input remote's engine-supplied Player, and `leave(player)` on
PlayerRemoving. Apply a server-side remote rate limiter before setInput.
Call exchange at **at most 5 Hz for the whole Roblox server**, coalescing inputs
for all players in each request. At 300 HTTP requests/minute this leaves 200 of
the documented 500 request/minute external budget for joins, leaves, terrain,
and other uses. Back off on failures; don't catch up with request bursts.

Clients must send complete held-control frames at least 5 Hz while connected,
including zero controls while idle. `seq` increases monotonically; bitmask bits
0..6 mean forward, back, left, right, jump, sprint, sneak. Yaw/pitch use
Mineflayer radians: yaw 0 looks toward -Z, positive yaw toward -X; positive pitch
looks up. SetInput rejects stale frames before they cross the external boundary.
Gameplay responses report `predicted` state separately from server `correction`.

The module intentionally does not infer successful damage, block changes, or
movement acceptance. Read docs/protocol.md before building the renderer. Runtime
EditableMesh validation, asset upload/permission checks, terrain streaming,
entity interpolation, and prediction/reconciliation are the next Roblox slice.
