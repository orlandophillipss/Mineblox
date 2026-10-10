// Read only presentation metadata from loaded authoritative Minecraft columns.
export function eyeSkyLight(bot) {
  const p = bot.entity?.position;
  if (!p || !bot.world?.getColumn) return null;
  const column = bot.world.getColumn(
    Math.floor(p.x / 16),
    Math.floor(p.z / 16),
  );
  const value = column?.getSkyLight?.({
    x: Math.floor(p.x) & 15,
    y: Math.floor(p.y + 1.62),
    z: Math.floor(p.z) & 15,
  });
  return Number.isInteger(value) && value >= 0 && value <= 15 ? value : null;
}
export function skyExposure(bot) {
  if (!['overworld', 'minecraft:overworld'].includes(bot.game?.dimension))
    return false;
  const p = bot.entity?.position;
  if (!p || !bot.world?.getColumn) return null;
  const column = bot.world.getColumn(
    Math.floor(p.x / 16),
    Math.floor(p.z / 16),
  );
  if (
    !Number.isInteger(column?.minY) ||
    !Number.isInteger(column?.worldHeight) ||
    column.worldHeight > 1024 ||
    column.worldHeight < 1
  )
    return null;
  const x = Math.floor(p.x) & 15,
    z = Math.floor(p.z) & 15;
  for (
    let y = Math.max(column.minY, Math.floor(p.y + 1.62) + 1);
    y < column.minY + column.worldHeight;
    y++
  ) {
    const block = column.getBlock({ x, y, z });
    if (!block) return null;
    if (
      !block.transparent &&
      block.shapes?.some(
        (s) =>
          s[0] === 0 &&
          s[1] === 0 &&
          s[2] === 0 &&
          s[3] === 1 &&
          s[4] === 1 &&
          s[5] === 1,
      )
    )
      return false;
  }
  return true;
}
export function fishVariant(entity, registry) {
  if (entity.name !== 'tropical_fish') return null;
  const index =
    registry?.entitiesByName?.tropical_fish?.metadataKeys?.indexOf(
      'type_variant',
    );
  const value = index >= 0 ? entity.metadata?.[index] : null;
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff
    ? value
    : null;
}
