# ADR 0005: world manager and self-hosted beta distribution

Cloudflare API setup uses Node's existing fetch implementation and scoped token
files; browser authorization uses the same optional official cloudflared binary.
Neither adds a gateway dependency. Operators can instead generate a Caddy HTTPS
proxy config and manage their own domain/port forwarding. Only loopback HTTP is
proxied; the offline Minecraft target remains private. Configuration previews
and explicit apply separate inspection from DNS/tunnel creation. Existing DNS
is never overwritten, and partial provisioning retains its tunnel ID for retry.

Keep Node 24 and the pinned Mineflayer protocol boundary. Use the existing vanilla
server's generation presets; each managed world gets its own server working
directory while the official downloaded server JAR remains shared privately.
Adopt the original save as `default` without moving it. Guard world mutations with
the live host lock, reject linked paths, and prefer recoverable archives/restores.

The manager owns child launch lifetimes and uses a bounded authenticated local
named pipe/Unix socket for console and lifecycle operations. Minecraft receives
ordinary console commands through standard input. Do not add public administration
routes or Roblox client console privileges. Managed hosts remain available after
the terminal menu exits; stopping the host invokes the existing world-save path.

An optional official `cloudflared` executable provides HTTPS from an outbound
connector without opening the offline Minecraft port. It is a justified external
deployment tool, installed with a release digest; no JavaScript dependency or new
runtime language is introduced. Quick Tunnels are a test path; named tunnels need
the operator's account/domain/token and a continuously running origin. Maintain
the bearer boundary and bind deployment sessions to the engine-provided game
server identity with bounded ownership/request/session maps.

Build publication places separately, omitting development credentials/pixels.
Published image content references permitted Roblox asset IDs and is bounded,
versioned data. Polling adds one shared request/minute, not per-frame/player
requests. Content changes refresh visuals/snapshots; code and model-format changes
still require a release. No remote code execution or duplicate gameplay authority.

Ship versioned source-based ZIPs with checksums and changelogs. Reuse Git archive
instead of adding a ZIP library. Do not bundle game binaries, private caches,
worlds or credentials. Mark the deployment milestone as beta until real published
Roblox runtime, assets, remote load and dependency/account-linking gates are met.

Sources and platform constraints are linked in [deployment](../deployment.md),
[content updates](../content.md) and [manager operation](../manager.md).
