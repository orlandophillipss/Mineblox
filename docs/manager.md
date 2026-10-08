# Worlds, launches and the server console

Option **13 Hosting setup** previews Cloudflare API-token or browser-auth setup,
accepts an existing tunnel token file, or generates an HTTPS reverse proxy config.
See [all hosting options](deployment.md). Use a private file for an API token;
the manager never needs it in a command argument or GitHub setting.

Extract the Windows ZIP and double-click `Manager.bat`. It installs missing
requirements, then opens a numbered terminal menu. Roblox Studio is needed for
Studio launch profiles; Minecraft-only and server-only profiles work without it.
New installations require explicit Minecraft EULA acceptance in menu option 11.

The original world remains `default`. Create worlds with a display name, seed,
vanilla generator and game mode, stop the host, then select the world to launch.
An empty seed lets Minecraft choose the seed. Each generated world has its own
save, player data, operator list, server properties and dimensions. The verified
Minecraft server JAR is shared privately; it is not copied into every world.

World operations require a stopped host. Backups copy save data into
`.local/backups`; restoring creates a new world ID, preserving the original.
Archive moves an unselected generated world into `.local/archived-worlds` rather
than deleting it. The active world and original legacy world cannot be archived.
World IDs are bounded identifiers, and operations reject links/junctions.

After installing requirements, the same operations are available from a CLI:

```sh
node tools/manager.js worlds list
node tools/manager.js worlds create adventure --seed=2026 --generator=normal --mode=survival
node tools/manager.js worlds select adventure
node tools/manager.js start both
node tools/manager.js status
node tools/manager.js client start SecondPlayer
node tools/manager.js client close SecondPlayer
node tools/manager.js console
node tools/manager.js stop
node tools/manager.js worlds backup adventure
node tools/manager.js worlds backups
node tools/manager.js worlds restore BACKUP_ID restored-adventure
node tools/manager.js worlds select default
node tools/manager.js worlds archive adventure
```

Profiles: `server`, `studio`, `minecraft`, `both`, `quick`, `named`, and `public`. A managed
host continues after closing the menu. Stop it through the menu or CLI to save
the world. One host runs per extracted installation; up to four named native
clients can be managed by that host. Every client still uses a normal Minecraft
connection. Use distinct usernames to avoid replacing an existing connection.

The console sends normal Minecraft commands directly to the server's standard
input. Enter `say hi` to broadcast `[Server] hi`, `op Username` to grant operator
permissions, `deop Username` to revoke them, or `list` to see connected players.
In the interactive manager console, `/logs` displays replies and `/back` returns
to the menu. The regular `Mineblox.bat` launch terminal also accepts these commands.
`stop` saves the world and shuts down the host. No console route exists on the
public gateway: management uses a private authenticated operating-system pipe.

Logs: `.local/logs/host-console.log` for managed host output, `minecraft.log` for
Minecraft, and `manager.log` for manager startup diagnostics. Private state and
credentials stay in `.local`. Do not include that folder when sharing a ZIP.
