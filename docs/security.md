# Prototype security boundary

Development only: Minecraft target is enforced to loopback, offline authentication
is explicit, gateway listens on loopback by default, and all endpoints require a
unique bearer secret of at least 32 characters. `.env` and `.local` are ignored.
Roblox server owns the engine-verified user identity; gateway does not authenticate
Roblox users independently. Do not expose this as a public multi-tenant service.

Controls are bounded full intentions, never destinations or gameplay outcomes.
Local launcher secrets are regenerated each launch and embedded exclusively in
ServerScriptService's private development config. They are never sent through
client remotes or logged. Studio-only HTTP/string-secret exceptions are rejected
by published game transport. Terrain acknowledgements affect rendering only;
they cannot alter Minecraft world state. Input and ack tables have bounded fields.
Version/sequence/control mask/look bounds, body/session/request caps, duplicate
identity reservation, input expiry and disconnect cleanup are implemented and
tested. Production needs per-game-server ownership, per-user action quotas,
token rotation, account linking, transport deployment and permission checks.

## Dependency audit, 2026-10-06

`npm audit --json` reported six **moderate** affected packages, stemming from
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): uuid versions
before 11.1.1 lack buffer bounds checking in specified UUID generation APIs when
given a caller buffer. The affected transitive paths are uuid -> yggdrasil and
uuid -> @azure/msal-node -> prismarine-auth, then minecraft-protocol/Mineflayer.
The gateway's session IDs use Node's `crypto.randomUUID`, not these UUID APIs.
Only offline development login is enabled here; Microsoft auth is not exposed.
This bounds prototype scope and does not prove all upstream call sites safe.

The audit's suggested "fix" downgrades Mineflayer to 1.4.0, incompatible with our
modern protocol goal. It was not applied. No forced transitive version override
was introduced without upstream compatibility evidence. Track an upstream fixed
dependency path before adding online login/public deployment. Audit is documented
and not described as passing; CI's actual gates are listed in AGENTS.md.
