# Remote hosting and release readiness

This release provides a self-hosted beta deployment path. Minecraft stays bound
to loopback in offline mode, while a Cloudflare connector exposes only the
bearer-authenticated HTTP gateway through HTTPS. Do not forward or tunnel the
offline Minecraft TCP port to public players. Native remote Minecraft account
authentication/linking is not implemented in this release.

## Free temporary sharing

The manager detects both managed hosts and standalone/native-launcher hosts.
Option 9 or `Stop host` saves and stops a current launcher through a private,
authenticated local pipe; option 6 can send normal console commands to either.
Older live launchers without that control pipe are shown as running and need
`stop` in their original terminal once. Never delete an active host lock to force
a second process into the same world. Native client start/close controls require
a managed launch. Reopen the manager after upgrading its code.

Choose `quick` in Manager's launch menu, or run:

```sh
node tools/manager.js start quick
```

The manager installs the official `cloudflared` executable after checking the
GitHub release SHA-256 digest. The HTTPS origin is printed in the host console
and saved in `.local/deployment-endpoint.json`. This works without an account,
domain purchase or port forwarding. Every gateway endpoint requires the secret.
Quick Tunnels change their hostname each launch, have no uptime guarantee and
allow at most 200 concurrent requests. They are testing infrastructure, not the
production hosting option. [Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Stable named tunnel

Manager option **13 Hosting setup** offers all supported connection methods.
Start a local server once and stop it so the gateway has a persistent port.

| Method                     | Credentials / networking                               | Launch profile |
| -------------------------- | ------------------------------------------------------ | -------------- |
| Temporary Cloudflare link  | No account or port forwarding; link changes            | `quick`        |
| Cloudflare API setup       | Scoped API token, account ID, zone ID, owned domain    | `named`        |
| Cloudflare browser setup   | Authorize your domain in Cloudflare; local certificate | `named`        |
| Existing Cloudflare tunnel | Connector token file and owned hostname                | `named`        |
| HTTPS reverse proxy        | Domain, Caddy or equivalent, reachable ports 80/443    | `public`       |

### Scoped Cloudflare API token

Create a token limited to the chosen account and zone: **Cloudflare Tunnel Edit**
(or the currently documented equivalent connector write permission), **Zone Read**,
and **DNS Edit**. Store it in a private local file; the manager asks for that file's
path, never a token in a command argument. Global account API keys are not needed.

```sh
node tools/manager.js deploy cloudflare-api https://bridge.example.com --account=ACCOUNT_ID --zone=ZONE_ID --api-token-file=.local/deployment/api-token.txt
# Inspect the preview; append --apply to create the tunnel and DNS route.
node tools/manager.js deploy cloudflare-api https://bridge.example.com --account=ACCOUNT_ID --zone=ZONE_ID --api-token-file=.local/deployment/api-token.txt --apply
node tools/manager.js start named
```

The setup checks that the hostname belongs to the selected account/zone and
refuses existing unrelated DNS records. It saves its own tunnel ID before further
changes, so a retry resumes that tunnel. The connector token stays in ignored
private storage. Partial failures retain the dedicated tunnel for retry/review;
there is no automatic deletion of Cloudflare resources. The provisioner and
failure cases are tested against an API fixture; a real account setup still
requires the operator's token and domain.
[Tunnel API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/create/),
[DNS API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)

### Cloudflare browser authorization

```sh
node tools/manager.js deploy cloudflare-login
node tools/manager.js deploy cloudflare-browser https://bridge.example.com
# Inspect the preview before applying.
node tools/manager.js deploy cloudflare-browser https://bridge.example.com --apply
node tools/manager.js start named
```

The official `cloudflared` tool opens Cloudflare's authorization page. You sign in,
choose the domain and authorize it yourself. Cloudflare saves its login certificate
in the standard user directory. Mineblox stores a dedicated tunnel's credentials
and local routing config under `.local/deployment`; these are excluded from Git
and ZIPs. This locally managed browser flow is optional; a remotely managed tunnel
with a scoped API token is the preferred automated deployment method.
[Official browser/local tunnel flow](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/)

### Existing remotely managed tunnel

1. Start a `server` profile once and stop it. Its persistent loopback origin is
   the `url` in `.local/launcher.json` (the file also contains a private secret).
2. In your Cloudflare account, create a remotely managed tunnel and route your
   chosen hostname to that loopback HTTP origin. This requires an account and a
   domain you control. Use an exact hostname; avoid an interactive Access login
   page in front of the Roblox API.
3. Store the connector token in `.local/deployment/tunnel-token.txt`. Keep it out
   of command lines, Git, screenshots and release files.
4. Configure and start:

```sh
node tools/manager.js deploy configure https://bridge.your-domain.example --token-file=.local/deployment/tunnel-token.txt
node tools/manager.js start named
```

The connector receives the token through its file; the origin remains loopback.
For a fixed port, set `MINEBLOX_GATEWAY_PORT` before launching and update the
Cloudflare route accordingly. The normal saved gateway port is otherwise reused.
The host computer must remain running and connected.
[Cloudflare named tunnel setup](https://developers.cloudflare.com/tunnel/get-started/),
[token-file support](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)

## HTTPS proxy and ordinary port forwarding

Cloudflare is optional. On a host with a public address, or a home router that
supports port forwarding, point a domain at that address and use an HTTPS proxy:

```sh
node tools/manager.js deploy reverse-proxy https://bridge.example.com
node tools/manager.js start public
caddy run --config .local/deployment/Caddyfile
```

Install Caddy from its official distribution and keep it running alongside
Mineblox. The generated config proxies only the loopback HTTP gateway. Forward
router TCP ports **80 and 443** to the proxy host and permit those ports in its
firewall; do not forward 25565 or the internal gateway port. A public address,
correct DNS and certificate validation reachability are prerequisites; carrier
grade NAT may prevent inbound hosting, in which case use a tunnel or VPS.
Domain, router, certificate and firewall setup remain operator tasks. This recipe
has not been run against a public router on this workstation.
[Caddy reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy)

## Published Roblox client setup

Build the separate publication output using the stable HTTPS origin:

```sh
node tools/build-place.js --published https://bridge.your-domain.example
node tools/manager.js deploy secret
```

Open `.local/published/Mineblox.rbxlx` in Studio and publish it to your experience.
The generated publication config contains the origin and secret name, never the
bearer value or private development pixel modules. Copy the value from the private
`.local/deployment/roblox-secret.txt` into Creator Hub Secret `MINEBLOX_TOKEN`,
restricted to the gateway's exact domain. Enable HTTP requests and the published
EditableMesh/EditableImage capabilities for an eligible creator/experience.
The Secret is also required when testing this publication place in Studio.
[Roblox secrets](https://create.roblox.com/docs/cloud-services/secrets),
[EditableMesh requirements](https://create.roblox.com/docs/reference/engine/classes/EditableMesh)

Supply a content catalog containing Roblox image assets you are permitted to
use, as described in [content updates](content.md). The repository and ZIPs do
not contain Minecraft recordings, textures or binaries. A publication build
without a supplied catalog uses diagnostic substitute visuals. Having a local
Minecraft asset cache does not grant rights to redistribute it in a public game.

Deployment requests carry the Roblox `game.JobId` ownership header. State,
movement, terrain and deletion are checked against the session's owner. Limits
remain global 16 players, at most four game servers, 16 sessions per game server,
600 authenticated requests/minute per game server and 1,200/minute globally.
These are bounds, not validated capacity claims. Published external chat is
disabled until cross-platform identity/filtering is implemented. Minecraft owns
all gameplay; the gateway operator controls the local console.

## Linux/container recipe

`deploy/Dockerfile` and `deploy/compose.yml` provide a Node 24/Java 21 server and
named Cloudflare connector sharing an isolated network. No host ports are
published. This recipe has not been run on this workstation; Windows hosting and
the temporary HTTPS tunnel have been tested live.

From `deploy`, build, initialize the persistent volume and explicitly accept the
EULA through manager option 11 before bringing up the services:

```sh
docker compose build
docker compose run --rm --no-deps -it mineblox node tools/manager.js
docker compose up -d
docker compose attach mineblox
```

The tunnel token file must exist on the host before starting its connector.
Configure its origin to `http://127.0.0.1:8080`. Use the attached server terminal
for normal console commands. Persistent data lives in `mineblox-data`; back it up
before replacing an image or changing worlds. To export the Roblox bearer value,
run the manager `deploy secret` command in the container, then copy its generated
file with `docker compose cp`. Do not expose the whole launcher config.

## Gates before a stable public release

Complete a real published Roblox join/play test with the configured Secret and
permitted assets, measure movement/terrain latency under remote load, validate
mesh memory budgets across devices, resolve the documented upstream dependency
advisory path, and provision continuous hosting/monitoring/backups. Microsoft
account linking is required before promising native public Minecraft access.
See [parity](parity.md) and [security](security.md). A working reverse proxy alone
does not establish production readiness or 1:1 Minecraft parity.
