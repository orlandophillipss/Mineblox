import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { AssetStore, resolveTexture } from '../bridge/assets.js';

// Development-only pixels stay in .local and in the private generated place.
// Nothing is uploaded to Roblox or included in the open-source repository.
const store = new AssetStore({
  version: '1.21.4',
  allowRemote: process.argv.includes('--remote'),
  localRoot: process.env.MINEBLOX_ASSET_ROOT,
});
const images = {},
  blocks = {};
const faces = ['west', 'east', 'down', 'up', 'north', 'south'];
async function image(relative) {
  if (images[relative]) return relative;
  const bytes = await store.get(relative);
  if (
    bytes.length < 24 ||
    bytes.readUInt32BE(16) > 256 ||
    bytes.readUInt32BE(20) > 256
  )
    throw new Error('Development image exceeds decode budget');
  const png = PNG.sync.read(bytes);
  if (png.width > 256 || png.height > 256)
    throw new Error('Development image exceeds pixel budget');
  images[relative] = {
    width: png.width,
    height: png.height,
    hex: png.data.toString('hex'),
  };
  return relative;
}
for (const name of [
  'grass_block',
  'dirt',
  'stone',
  'bedrock',
  'cobblestone',
  'oak_planks',
  'sand',
  'snow_block',
  'gravel',
  'granite',
  'diorite',
  'andesite',
  'deepslate',
  'netherrack',
  'end_stone',
  'coal_ore',
  'iron_ore',
  'copper_ore',
  'gold_ore',
  'diamond_ore',
  'redstone_ore',
  'oak_log',
  'birch_log',
  'spruce_log',
  'oak_leaves',
  'birch_leaves',
  'spruce_leaves',
  'glass',
  'moss_block',
  'sandstone',
  'clay',
  'dark_oak_log',
  'dark_oak_leaves',
  'mushroom_stem',
  'red_mushroom_block',
  'brown_mushroom_block',
]) {
  try {
    const model = await store.model(`minecraft:block/${name}`);
    const element = model.elements?.[0];
    if (!element) continue;
    blocks[name] = [];
    for (const face of faces) {
      const texture = resolveTexture(
        model.textures,
        element.faces[face].texture,
      );
      blocks[name].push(await image(texture));
    }
  } catch {
    /* Missing optional assets use the original color renderer. */
  }
}
const gui = {};
for (const name of [
  'mushroom_stem',
  'red_mushroom_block',
  'brown_mushroom_block',
]) {
  try {
    const relative = await image(`assets/minecraft/textures/block/${name}.png`);
    blocks[name] = Array(6).fill(relative);
    await image('assets/minecraft/textures/block/mushroom_block_inside.png');
  } catch {
    /* Missing optional images retain visible diagnostic substitutes. */
  }
}
for (const [key, relative] of Object.entries({
  heartFull: 'gui/sprites/hud/heart/full.png',
  heartHalf: 'gui/sprites/hud/heart/half.png',
  heartEmpty: 'gui/sprites/hud/heart/container.png',
  foodFull: 'gui/sprites/hud/food_full.png',
  foodHalf: 'gui/sprites/hud/food_half.png',
  foodEmpty: 'gui/sprites/hud/food_empty.png',
  hotbar: 'gui/sprites/hud/hotbar.png',
  selection: 'gui/sprites/hud/hotbar_selection.png',
  crosshair: 'gui/sprites/hud/crosshair.png',
  experienceBack: 'gui/sprites/hud/experience_bar_background.png',
  experienceFill: 'gui/sprites/hud/experience_bar_progress.png',
})) {
  try {
    gui[key] = await image(`assets/minecraft/textures/${relative}`);
  } catch {
    /* Optional GUI images. */
  }
}
// JSON object punctuation differs from Luau; emit explicit table fields.
const quote = JSON.stringify;
const imageFields = Object.entries(images).map(
  ([key, p]) =>
    `[${quote(key)}] = { width = ${p.width}, height = ${p.height}, hex = ${quote(p.hex)} }`,
);
const blockFields = Object.entries(blocks)
  .filter(([, p]) => p.length === 6)
  .map(([key, p]) => `[${quote(key)}] = { ${p.map(quote).join(', ')} }`);
const guiFields = Object.entries(gui).map(
  ([key, value]) => `${key} = ${quote(value)}`,
);
await mkdir('.local/roblox', { recursive: true });
await writeFile(
  '.local/roblox/DevelopmentAssets.luau',
  `-- Private development assets; no upload or redistribution authorization.\nreturn { images = { ${imageFields.join(',\n')} }, blocks = { ${blockFields.join(',\n')} }, gui = { ${guiFields.join(',\n')} } }\n`,
);
console.log(
  `Prepared ${Object.keys(images).length} private images and ${blockFields.length} block materials`,
);
