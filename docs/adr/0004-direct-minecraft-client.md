# ADR 0004: direct local Minecraft GUI launcher

The development workflow needs a native Minecraft client that opens directly in
the same authoritative server as the Roblox frontend. Keep the existing pinned
1.21.4 GUI downloader and use Mojang's version metadata for JVM/game arguments,
including native library extraction paths and multiplayer Quick Play. Use Java
21 `javaw.exe` for the Windows client. No library or runtime language is added;
the bootstrap installs a private verified Java 21 runtime when needed.

The standalone batch launcher first checks the loopback server's Minecraft
status protocol version. A compatible existing server is reused without taking
ownership of its lifetime. If absent, start the existing Node launcher without
Studio and retain its private standard-input control pipe. Closing the GUI sends
`stop` through that pipe and awaits the normal Minecraft world save. The combined
launcher similarly owns its optional GUI helper and closes it on shutdown.
There is no new HTTP administration endpoint or client gameplay authority.

A listening TCP socket alone is insufficient readiness: vanilla Minecraft may
accept a connection before it can answer a status request. Startup waits for a
compatible status response with a bounded deadline. Only a server this launcher
has just started receives transient startup retries; an unrelated or incompatible
existing listener fails visibly instead of being silently replaced by the client.
The main Mineblox launcher's user-authorized required-port cleanup remains in
effect when starting replacement services.

The identity is explicitly an offline development username. Use a separate
default name, `MinebloxJava`, to avoid disconnecting a Roblox protocol player with
the same name. Do not read installed launcher credentials or imply Microsoft
account authentication. Downloads and extracted assets stay in ignored `.local`;
existing EULA acceptance and user GUI settings are preserved.

Sources: [official Quick Play arguments](https://feedback.minecraft.net/hc/en-us/articles/16499677456781-Minecraft-Java-Edition-1-20-Trails-Tales),
[official version manifest](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json),
[LWJGL native library loader](https://github.com/LWJGL/lwjgl3/blob/master/modules/lwjgl/core/src/main/java/org/lwjgl/system/SharedLibraryLoader.java),
[Prismarine Minecraft status ping](https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/src/ping.js).
