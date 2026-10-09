import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { AssetStore, resolveTexture } from '../bridge/assets.js';
import minecraftData from 'minecraft-data';
import { compileItem, auditItems } from '../bridge/item-models.js';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = sha256(
  Buffer.concat(
    await Promise.all(
      [
        'tools/prepare-roblox-assets.js',
        'bridge/assets.js',
        'bridge/models.js',
        'bridge/item-models.js',
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
  'crafting_table',
  'furnace',
  'blast_furnace',
  'smoker',
  'barrel',
  'obsidian',
  'crying_obsidian',
  'glowstone',
  'nether_bricks',
  'nether_wart_block',
  'soul_sand',
  'soul_soil',
  'magma_block',
  'nether_quartz_ore',
  'nether_gold_ore',
  'ancient_debris',
  'blackstone',
  'cobbled_deepslate',
  'tuff',
  'calcite',
  'bookshelf',
  'white_wool',
  'red_wool',
  'orange_wool',
  'yellow_wool',
  'green_wool',
  'blue_wool',
  'black_wool',
  'bricks',
  'smooth_stone',
  'ice',
  'packed_ice',
  'blue_ice',
  'redstone_block',
  'iron_block',
  'gold_block',
  'diamond_block',
  'emerald_ore',
  'lapis_ore',
  'end_stone_bricks',
  'purpur_block',
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
const registry = minecraftData('1.21.4');
const blockFailures = [];
const blockNames = [
  ...new Set([
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
    ...registry.blocksArray
      .filter((block) =>
        /_(stairs|slab|fence|fence_gate|wall|door|trapdoor|pane|sapling)$/.test(
          block.name,
        ),
      )
      .map((block) => block.name),
  ]),
];
let nextBlock = 0;
async function prepareBlock(name) {
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
    blockFailures.push({ name, reason: error.message });
    console.warn(`Model ${name}: ${error.message}`);
  }
}
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (nextBlock < blockNames.length)
      await prepareBlock(blockNames[nextBlock++]);
  }),
);
await writeFile(
  '.local/roblox/block-audit.json',
  JSON.stringify(
    {
      version: '1.21.4',
      requested: blockNames.length,
      supported: Object.keys(catalog).sort(),
      unresolved: blockFailures.sort((a, b) => a.name.localeCompare(b.name)),
    },
    null,
    2,
  ),
);
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
for (const [name, file] of Object.entries({
  sun: 'sun',
  moon: 'moon_phases',
  clouds: 'clouds',
})) {
  try {
    gui[name] = await image(
      `assets/minecraft/textures/environment/${file}.png`,
    );
  } catch (error) {
    console.warn(`Environment ${name}: ${error.message}`);
  }
}
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
  'ender_pearl',
  'ender_eye',
  'blaze_rod',
  'blaze_powder',
  'ghast_tear',
  'gunpowder',
  'bone',
  'string',
  'rotten_flesh',
  'flint',
  'flint_and_steel',
  'gold_ingot',
  'copper_ingot',
  'redstone',
  'lapis_lazuli',
  'emerald',
  'netherite_ingot',
  'netherite_scrap',
  'nether_wart',
  'wheat',
  'wheat_seeds',
  'carrot',
  'potato',
  'beetroot',
  'egg',
  'leather',
  'feather',
  'porkchop',
  'cooked_porkchop',
  'beef',
  'chicken',
  'cooked_chicken',
  'mutton',
  'cooked_mutton',
  'cod',
  'cooked_cod',
  'salmon',
  'cooked_salmon',
  'book',
  'paper',
  'glass_bottle',
  'potion',
  'ender_dragon_spawn_egg',
  'zombie_spawn_egg',
  'pig_spawn_egg',
]) {
  try {
    items[name] = await image(`assets/minecraft/textures/item/${name}.png`);
  } catch {
    /* Block items use their block texture below. */
  }
}
for (const [name, textures] of Object.entries(blocks))
  if (!items[name] && textures.length === 6) items[name] = textures[3];
const itemModels = {},
  itemFailures = {};
const wanted = new Set([
  ...Object.keys(blocks),
  ...Object.keys(items),
  ...Object.keys(catalog),
  ...registry.itemsArray.slice(0, 64).map((item) => item.name),
  ...registry.itemsArray.map((item) => item.name),
]);
for (const wood of [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'pale_oak',
  'bamboo',
  'crimson',
  'warped',
])
  for (const suffix of ['planks', 'stairs', 'slab'])
    wanted.add(`${wood}_${suffix}`);
async function composedSprite(name, layers) {
  const first = images[layers[0].texture];
  const bytes = Buffer.alloc(first.width * first.height * 4);
  for (const layer of layers) {
    const source = images[layer.texture];
    const pixels = Buffer.from(source.hex, 'hex');
    for (let y = 0; y < first.height; y++)
      for (let x = 0; x < first.width; x++) {
        const i = (x + y * first.width) * 4,
          j =
            (Math.floor((x * source.width) / first.width) +
              Math.floor((y * source.height) / first.height) * source.width) *
            4;
        const a = pixels[j + 3] / 255,
          b = bytes[i + 3] / 255,
          out = a + b * (1 - a);
        if (!out) continue;
        for (let c = 0; c < 3; c++)
          bytes[i + c] = Math.round(
            (((pixels[j + c] * (layer.tint?.[c] ?? 255)) / 255) * a +
              bytes[i + c] * b * (1 - a)) /
              out,
          );
        bytes[i + 3] = Math.round(out * 255);
      }
  }
  const key = `generated/items/${name}.png`;
  images[key] = {
    width: first.width,
    height: first.height,
    hex: bytes.toString('hex'),
  };
  return key;
}
let completed = 0;
async function prepareItem(name) {
  if (!registry.itemsByName[name] || name === 'air') return;
  try {
    const compiled = await compileItem(store, name, image, composedSprite);
    compiled.blockItem = Boolean(registry.blocksByName[name]);
    itemModels[name] = compiled;
    if (compiled.kind === 'sprite') items[name] = compiled.texture;
    if (
      !blocks[name] &&
      compiled.kind === 'mesh' &&
      compiled.faces.length === 6
    ) {
      const cubeFaces = Array(6).fill(null);
      for (const face of compiled.faces) {
        if (face.points.some((p) => p.some((n) => n !== 0 && n !== 1)))
          continue;
        const axis = [0, 1, 2].find((a) =>
          face.points.every((p) => p[a] === face.points[0][a]),
        );
        if (axis !== undefined)
          cubeFaces[axis * 2 + face.points[0][axis]] = face.texture;
      }
      if (cubeFaces.every(Boolean)) blocks[name] = cubeFaces;
    }
  } catch (error) {
    itemFailures[name] = error.message;
  }
  if (++completed % 100 === 0)
    console.log(`Audited ${completed}/${wanted.size} item definitions`);
}
const names = [...wanted].sort();
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < names.length) await prepareItem(names[next++]);
  }),
);
const itemAudit = auditItems(registry, itemModels, itemFailures);
await mkdir('.local/roblox', { recursive: true });
await writeFile(
  '.local/roblox/item-audit.json',
  JSON.stringify(itemAudit, null, 2),
);
console.log(
  `Validated ${itemAudit.supportedCount} item models; ${itemAudit.unresolvedCount} unresolved items are listed in .local/roblox/item-audit.json`,
);
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
  inventory: 'gui/container/inventory.png',
  crafting: 'gui/container/crafting_table.png',
})) {
  try {
    gui[key] = await image(`assets/minecraft/textures/${relative}`);
  } catch {
    /* Optional GUI images. */
  }
}
// JSON object punctuation differs from Luau; emit explicit table fields.
const quote = JSON.stringify;
const imageFields = Object.entries(images).flatMap(([key, p]) => {
  if (p.hex.length < 170000)
    return [
      `[${quote(key)}] = { width = ${p.width}, height = ${p.height}, hex = ${quote(p.hex)} }`,
    ];
  const fields = [],
    chunks = [];
  for (let offset = 0; offset < p.hex.length; offset += 160000) {
    const chunk = `raw:${key}:${offset}`;
    chunks.push(chunk);
    fields.push(
      `[${quote(chunk)}] = { hex = ${quote(p.hex.slice(offset, offset + 160000))} }`,
    );
  }
  fields.push(
    `[${quote(key)}] = { width = ${p.width}, height = ${p.height}, hexChunks = { ${chunks.map(quote).join(',')} } }`,
  );
  return fields;
});
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
const modelPacks = [];
const catalogPacks = [];
for (const [field, map] of Object.entries({ blocks, gui, items, entities })) {
  let entries = [],
    length = 0;
  for (const [name, value] of Object.entries(map).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const entry = `[${quote(name)}]=${luau(value)}`;
    if (length + entry.length > 140000 && entries.length) {
      catalogPacks.push({ field, entries });
      entries = [];
      length = 0;
    }
    entries.push(entry);
    length += entry.length;
  }
  if (entries.length) catalogPacks.push({ field, entries });
}
for (let i = 0; i < catalogPacks.length; i++)
  await writeFile(
    `.local/roblox/AssetCatalog${i + 1}.luau`,
    `return {${catalogPacks[i].field}={${catalogPacks[i].entries.join(',\n')}}}\n`,
  );
let modelPack = [],
  modelLength = 0;
for (const [name, model] of Object.entries(itemModels).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const field = `[${quote(name)}]=${luau(model)}`;
  if (modelLength + field.length > 150000 && modelPack.length) {
    modelPacks.push(modelPack);
    modelPack = [];
    modelLength = 0;
  }
  modelPack.push(field);
  modelLength += field.length;
}
if (modelPack.length) modelPacks.push(modelPack);
for (let i = 0; i < modelPacks.length; i++)
  await writeFile(
    `.local/roblox/AssetModels${i + 1}.luau`,
    `return {${modelPacks[i].join(',\n')}}\n`,
  );
for (let i = 0; i < packs.length; i++)
  await writeFile(
    `.local/roblox/AssetPixels${i + 1}.luau`,
    `return { ${packs[i].join(',\n')} }\n`,
  );
const developmentSource =
  [
    '-- Private development assets; no upload or redistribution authorization.',
    'local images = {}',
    ...packs.map(
      (_, i) =>
        `for key,value in pairs(require(script.Parent.AssetPixels${i + 1})) do images[key]=value end`,
    ),
    'local itemModels={}',
    ...modelPacks.map(
      (_, i) =>
        `for key,value in pairs(require(script.Parent.AssetModels${i + 1})) do itemModels[key]=value end`,
    ),
    'local metadata={blocks={},items={},gui={},entities={}}',
    ...catalogPacks.map(
      (_, i) =>
        `for field,entries in pairs(require(script.Parent.AssetCatalog${i + 1})) do for key,value in pairs(entries) do metadata[field][key]=value end end`,
    ),
    'local consumed={}',
    'for _,image in pairs(images) do if image.hexChunks then local chunks={} for _,key in ipairs(image.hexChunks) do table.insert(chunks,images[key].hex) table.insert(consumed,key) end image.hex=table.concat(chunks) image.hexChunks=nil end end',
    'for _,key in ipairs(consumed) do images[key]=nil end',
    `return {images=images,itemModels=itemModels,blocks=metadata.blocks,gui=metadata.gui,font=${luau(font)},items=metadata.items,entities=metadata.entities}`,
  ].join('\n') + '\n';
await writeFile('.local/roblox/DevelopmentAssets.luau', developmentSource);
console.log(
  `Prepared ${Object.keys(images).length} private images and ${blockFields.length} block materials`,
);
const files = {};
for (const file of [
  '.local/roblox/DevelopmentAssets.luau',
  '.local/roblox/model-catalog.json',
  '.local/roblox/item-audit.json',
  ...modelPacks.map((_, i) => `.local/roblox/AssetModels${i + 1}.luau`),
  ...catalogPacks.map((_, i) => `.local/roblox/AssetCatalog${i + 1}.luau`),
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
