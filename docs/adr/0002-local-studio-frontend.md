# ADR 0002: local Studio frontend and development tooling

Accepted for the local prototype, 2026-10-07.

Use Roblox's built-in StudioMCP executable through the official MCP SDK for
place inspection, script installation and playtest control. A version-discovering
launcher avoids the stale, malformed `mcp.bat` left after a Studio repair.
Rojo 7.7.1 builds a private place; Luau 0.741 validates source. Both are portable,
downloaded from official releases and checked against GitHub SHA-256 digests.
They add no runtime language to the bridge.

PNGJS 7.0.0 decodes bounded PNG images during development asset preparation.
It does not run in gameplay exchanges. Minecraft images are opt-in, pinned to
1.21.4, cached in ignored `.local`, and embedded only in a private generated
place. EditableImage displays their pixels without uploading them to Roblox.
The source repository contains no Minecraft images or binaries.

Local Studio uses an authenticated loopback HTTP gateway. The public quick
tunnel failed its health test, and approval review rejected an additional
credentialed public-tunnel diagnostic as possible secret egress. The launcher
therefore has no public tunnel. Published Roblox servers require a separately
configured authenticated HTTPS gateway and a Roblox Secret; this launcher is
for local Studio only.

Gameplay batches at 5 Hz and terrain at 2 Hz, shared across the entire game
server. Minecraft coordinates map to Roblox at four studs per block. Display
extrapolation is capped at 200 ms; server corrections remain explicitly distinct
from Mineflayer's predicted movement. This is not a claim of zero-latency parity.
