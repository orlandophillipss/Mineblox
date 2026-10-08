import { createHash } from 'node:crypto';
import os from 'node:os';

export function offlineUuid(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(name))
    throw new Error(
      'Minecraft player name must contain 3–16 letters, numbers or underscores',
    );
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  bytes[6] = (bytes[6] & 15) | 48;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
export function rulesAllow(
  rules,
  features = {},
  platform = { name: 'windows', arch: 'amd64', version: os.release() },
) {
  if (!rules) return true;
  let allowed = false;
  for (const rule of rules) {
    if (
      rule.os &&
      ((rule.os.name && rule.os.name !== platform.name) ||
        (rule.os.arch && !new RegExp(rule.os.arch).test(platform.arch)) ||
        (rule.os.version &&
          !new RegExp(rule.os.version).test(platform.version)))
    )
      continue;
    if (
      Object.entries(rule.features ?? {}).some(
        ([key, value]) => (features[key] ?? false) !== value,
      )
    )
      continue;
    allowed = rule.action === 'allow';
  }
  return allowed;
}
export function clientArguments(metadata, values) {
  if (
    metadata.id !== '1.21.4' ||
    metadata.mainClass !== 'net.minecraft.client.main.Main'
  )
    throw new Error(
      'Only the pinned vanilla Minecraft 1.21.4 client is supported',
    );
  if (values.quickPlayMultiplayer !== '127.0.0.1:25565')
    throw new Error(
      'Development client target must be the local Mineblox server',
    );
  offlineUuid(values.auth_player_name);
  const features = {
    has_custom_resolution: true,
    has_quick_plays_support: true,
    is_quick_play_multiplayer: true,
  };
  function expand(args) {
    return args
      .flatMap((arg) =>
        typeof arg === 'string'
          ? [arg]
          : rulesAllow(arg.rules, features)
            ? Array.isArray(arg.value)
              ? arg.value
              : [arg.value]
            : [],
      )
      .map((arg) =>
        arg.replace(/\$\{([^}]+)\}/g, (_, key) => {
          if (values[key] === undefined)
            throw new Error(`Missing Minecraft launch value: ${key}`);
          return String(values[key]);
        }),
      );
  }
  return [
    '-Xms256M',
    '-Xmx1G',
    '-Xss4M',
    ...expand(metadata.arguments.jvm),
    metadata.mainClass,
    ...expand(metadata.arguments.game),
  ];
}
