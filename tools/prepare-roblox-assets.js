import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { AssetStore, resolveTexture } from '../bridge/assets.js';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = sha256(
  Buffer.concat(
    await Promise.all(
      [
        'tools/prepare-roblox-assets.js',
        'bridge/assets.js',
        'bridge/models.js',
      ].map((f) => readFile(f)),
    ),
  ),
);
try {
  const saved = JSON.parse(
    await readFile('.local/roblox/assets-ready.json', 'utf8'),
  );
  if (
    !process.argv.includes('--force') &&
    saved.fingerprint === fingerprint &&
    saved.localRoot === (process.env.MINEBLOX_ASSET_ROOT ?? null) &&
    (!process.argv.includes('--remote') || saved.remote)
  ) {
    for (const [file, hash] of Object.entries(saved.files))
      if (sha256(await readFile(file)) !== hash)
        throw new Error('Processed asset integrity mismatch');
    console.log(
      `Reused ${saved.images} cached private images; no asset regeneration`,
    );
    process.exit(0);
  }
} catch {
  /* Prepare missing or changed processed data below. */
}

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
    bytes.readUInt32BE(20) > 4096 ||
    bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 262144
  )
    throw new Error('Development image exceeds decode budget');
  const png = PNG.sync.read(bytes);
  if (png.width > 256 || png.height > 4096)
    throw new Error('Development image exceeds pixel budget');
  const height =
    relative.includes('/block/') && png.height > png.width
      ? png.width
      : png.height;
  images[relative] = {
    width: png.width,
    height,
    hex: png.data.subarray(0, png.width * height * 4).toString('hex'),
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
const entities = {};
for (const [name, relative] of Object.entries({
  pig: 'pig/pig',
  cow: 'cow/cow',
  creeper: 'creeper/creeper',
  zombie: 'zombie/zombie',
  skeleton: 'skeleton/skeleton',
  player: 'player/wide/steve',
})) {
  try {
    entities[name] = await image(
      `assets/minecraft/textures/entity/${relative}.png`,
    );
  } catch (error) {
    console.warn(`Entity ${name}: ${error.message}`);
  }
}
const catalog = {};
for (const name of [
  'oak_stairs',
  'oak_slab',
  'oak_fence',
  'oak_fence_gate',
  'oak_door',
  'oak_trapdoor',
  'torch',
  'wall_torch',
  'short_grass',
  'fern',
  'dandelion',
  'poppy',
  'glass_pane',
  'stone_stairs',
  'stone_slab',
]) {
  try {
    const blockstate = await store.json(
      `assets/minecraft/blockstates/${name}.json`,
    );
    const values = [
      ...Object.values(blockstate.variants ?? {}),
      ...(blockstate.multipart ?? []).map((p) => p.apply),
    ].flat();
    const models = {};
    for (const reference of new Set(values.map((v) => v.model))) {
      const model = await store.model(reference);
      for (const element of model.elements ?? [])
        for (const face of Object.values(element.faces ?? {}))
          await image(resolveTexture(model.textures, face.texture));
      models[reference] = model;
    }
    catalog[name] = { blockstate, models };
  } catch (error) {
    console.warn(`Model ${name}: ${error.message}`);
  }
}
for (const name of ['water', 'lava']) {
  try {
    const texture = await image(
      `assets/minecraft/textures/block/${name}_still.png`,
    );
    blocks[name] = Array(6).fill(texture);
  } catch (error) {
    console.warn(`Fluid ${name}: ${error.message}`);
  }
}
for (let i = 0; i < 10; i++) {
  try {
    gui[`crack${i}`] = await image(
      `assets/minecraft/textures/block/destroy_stage_${i}.png`,
    );
  } catch {
    /* Optional visual feedback. */
  }
}
const items = {};
for (const name of [
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'diamond_pickaxe',
  'netherite_pickaxe',
  'wooden_axe',
  'stone_axe',
  'iron_axe',
  'diamond_axe',
  'wooden_sword',
  'stone_sword',
  'iron_sword',
  'diamond_sword',
  'apple',
  'bread',
  'cooked_beef',
  'stick',
  'coal',
  'iron_ingot',
  'diamond',
  'torch',
  'bow',
  'arrow',
  'bucket',
  'water_bucket',
  'lava_bucket',
  'shield',
  'iron_helmet',
  'iron_chestplate',
  'iron_leggings',
  'iron_boots',
  'oak_door',
  'oak_sign',
  'crafting_table',
  'chest',
]) {
  try {
    items[name] = await image(`assets/minecraft/textures/item/${name}.png`);
  } catch {
    /* Block items use their block texture below. */
  }
}
for (const [name, textures] of Object.entries(blocks))
  if (!items[name] && textures.length === 6) items[name] = textures[3];
const font = {};
try {
  const definition = await store.json(
    'assets/minecraft/font/include/default.json',
  );
  const provider = definition.providers.find(
    (p) => p.type === 'bitmap' && p.file.endsWith('/ascii.png'),
  );
  if (provider) {
    const relative = `assets/minecraft/textures/${provider.file.split(':')[1]}`;
    await image(relative);
    const data = images[relative];
    const pixels = Buffer.from(data.hex, 'hex');
    const width = data.width / [...provider.chars[0]].length;
    const height = data.height / provider.chars.length;
    font.image = relative;
    font.height = height;
    font.glyphs = {};
    provider.chars.forEach((row, y) =>
      [...row].forEach((char, x) => {
        if (char === '\u0000') return;
        let extent = char === ' ' ? 3 : 0;
        for (let px = 0; px < width; px++)
          for (let py = 0; py < height; py++)
            if (
              pixels[(x * width + px + (y * height + py) * data.width) * 4 + 3]
            )
              extent = Math.max(extent, px + 1);
        font.glyphs[char] = {
          x: x * width,
          y: y * height,
          width,
          height,
          advance: extent + 1,
        };
      }),
    );
  }
} catch (error) {
  console.warn(`Bitmap font unavailable: ${error.message}`);
}
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
// Studio limits Script.Source to 200k characters. Keep pixel modules smaller
// and compose them locally instead of growing one monolithic source string.
const packs = [];
let pack = [];
let length = 0;
for (const field of imageFields) {
  if (length + field.length > 180000 && pack.length) {
    packs.push(pack);
    pack = [];
    length = 0;
  }
  pack.push(field);
  length += field.length;
}
if (pack.length) packs.push(pack);
const blockFields = Object.entries(blocks)
  .filter(([, p]) => p.length === 6)
  .map(([key, p]) => `[${quote(key)}] = { ${p.map(quote).join(', ')} }`);
const guiFields = Object.entries(gui).map(
  ([key, value]) => `${key} = ${quote(value)}`,
);
function luau(value) {
  if (Array.isArray(value)) return `{ ${value.map(luau).join(', ')} }`;
  if (value && typeof value === 'object')
    return `{ ${Object.entries(value)
      .map(([k, v]) => `[${quote(k)}] = ${luau(v)}`)
      .join(', ')} }`;
  return quote(value);
}
await mkdir('.local/roblox', { recursive: true });
await writeFile('.local/roblox/model-catalog.json', JSON.stringify(catalog));
for (let i = 0; i < packs.length; i++)
  await writeFile(
    `.local/roblox/AssetPixels${i + 1}.luau`,
    `return { ${packs[i].join(',\n')} }\n`,
  );
await writeFile(
  '.local/roblox/DevelopmentAssets.luau',
  `-- Private development assets; no upload or redistribution authorization.\nlocal images = {}\n${packs.map((_, i) => `for key, value in pairs(require(script.Parent.AssetPixels${i + 1})) do images[key] = value end`).join('\n')}\nreturn { images = images, blocks = { ${blockFields.join(',\n')} }, gui = { ${guiFields.join(',\n')} }, font = ${luau(font)}, items = ${luau(items)}, entities = ${luau(entities)} }\n`,
);
console.log(
  `Prepared ${Object.keys(images).length} private images and ${blockFields.length} block materials`,
);
const files = {};
for (const file of [
  '.local/roblox/DevelopmentAssets.luau',
  '.local/roblox/model-catalog.json',
  ...packs.map((_, i) => `.local/roblox/AssetPixels${i + 1}.luau`),
])
  files[file] = sha256(await readFile(file));
await writeFile(
  '.local/roblox/assets-ready.json',
  JSON.stringify({
    fingerprint,
    localRoot: process.env.MINEBLOX_ASSET_ROOT ?? null,
    remote: process.argv.includes('--remote'),
    images: Object.keys(images).length,
    files,
  }),
);
