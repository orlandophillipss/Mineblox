export function minecraftConfig(env = process.env) {
  const port = Number(env.MC_PORT ?? 25565);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid MC_PORT');
  const host = env.MC_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host))
    throw new Error('Offline development target must be loopback');
  const version = env.MC_VERSION ?? '1.21.4';
  if (version !== '1.21.4')
    throw new Error('This prototype is pinned to Minecraft Java 1.21.4');
  return { host, port, version };
}
