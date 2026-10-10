// Rendering only: level is the server's blockstate, never a local fluid rule.
// Prismarine's rendered depth treats falling levels 8..15 as source depth.
export function fluidKind(block) {
  if (!block) return null;
  if (block.name === 'lava') return 'lava';
  if (
    [
      'water',
      'bubble_column',
      'kelp',
      'kelp_plant',
      'seagrass',
      'tall_seagrass',
    ].includes(block.name) ||
    block.properties?.waterlogged === true ||
    block.properties?.waterlogged === 'true'
  )
    return 'water';
  return null;
}

export function fluidHeight(level, sameFluidAbove = false) {
  if (sameFluidAbove) return 1;
  const depth = Number.isInteger(Number(level)) ? Number(level) : 0;
  return (8 - (depth >= 8 ? 0 : Math.max(0, Math.min(7, depth)))) / 9;
}

// 1.21.4 LiquidBlockRenderer: source-depth contributions have weight ten;
// non-fluid, non-solid neighbours contribute zero, solids are excluded.
// This constructs surfaces from server states, never simulates water spread.
export function fluidCorners(at, x, y, z, kind) {
  const height = (dx, dz) => {
    const block = at(x + dx, y, z + dz);
    if (fluidKind(block) === kind)
      return fluidHeight(
        block?.properties?.level,
        fluidKind(at(x + dx, y + 1, z + dz)) === kind,
      );
    return block?.shapes?.length ? -1 : 0;
  };
  const center = height(0, 0);
  if (center >= 1) return [1, 1, 1, 1];
  const corner = (dx, dz) => {
    const a = height(dx, 0),
      b = height(0, dz);
    if (a >= 1 || b >= 1) return 1;
    const values = [center, a, b];
    if (a > 0 || b > 0) {
      const diagonal = height(dx, dz);
      if (diagonal >= 1) return 1;
      values.push(diagonal);
    }
    let sum = 0,
      weights = 0;
    for (const value of values)
      if (value >= 0) {
        const weight = value >= 0.8 ? 10 : 1;
        sum += value * weight;
        weights += weight;
      }
    return weights ? sum / weights : 0;
  };
  return [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)];
}
