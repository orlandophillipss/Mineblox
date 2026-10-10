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
