// Presentation categories, using the negotiated registry. Minecraft still
// validates every creative inventory edit; these filters grant no permissions.
export const CREATIVE_TABS = [
  'building',
  'colored',
  'natural',
  'functional',
  'redstone',
  'tools',
  'combat',
  'food',
  'ingredients',
  'eggs',
  'operator',
  'search',
  'inventory',
];
export function inCreativeTab(item, tab, registry) {
  const n = item.name,
    block = registry.blocksByName?.[n];
  const food =
    registry.foodsByName?.[n] ||
    /^(apple|golden_apple|enchanted_golden_apple|bread|cake|cookie|melon_slice|dried_kelp|sweet_berries|glow_berries|honey_bottle|milk_bucket|pufferfish|tropical_fish|rotten_flesh|spider_eye|chorus_fruit|beetroot|beetroot_soup|mushroom_stew|rabbit_stew|suspicious_stew|carrot|golden_carrot|potato|baked_potato|poisonous_potato|pumpkin_pie|beef|porkchop|chicken|rabbit|mutton|cod|salmon|cooked_.*)$/.test(
      n,
    );
  const tool =
    /(_pickaxe|_axe|_shovel|_hoe|_bucket|_boat|_raft|_minecart|_on_a_stick)$/.test(
      n,
    ) ||
    /^(fishing_rod|flint_and_steel|shears|brush|compass|recovery_compass|clock|spyglass|lead|name_tag|elytra|firework_rocket|bundle|saddle|bucket|minecart|filled_map|map)$/.test(
      n,
    );
  const combat =
    /(_sword|_helmet|_chestplate|_leggings|_boots|_horse_armor|_arrow)$/.test(
      n,
    ) ||
    /^(bow|crossbow|arrow|trident|mace|shield|totem_of_undying|turtle_helmet|wolf_armor)$/.test(
      n,
    );
  const operator =
    /^(command_block|chain_command_block|repeating_command_block|command_block_minecart|structure_block|structure_void|jigsaw|barrier|light|debug_stick)$/.test(
      n,
    );
  const redstone =
    /(_button|_pressure_plate|_trapdoor|_door)$/.test(n) ||
    /^(redstone.*|repeater|comparator|piston|sticky_piston|observer|lever|dispenser|dropper|hopper|target|tripwire_hook|daylight_detector|note_block|sculk_sensor|calibrated_sculk_sensor|rail|powered_rail|detector_rail|activator_rail|tnt)$/.test(
      n,
    );
  const natural =
    /(_leaves|_sapling|_ore|_log|_wood|_stem|_hyphae|_coral|_coral_block|_coral_fan)$/.test(
      n,
    ) ||
    /^(grass.*|dirt|coarse_dirt|podzol|rooted_dirt|mud|sand|red_sand|gravel|clay|snow.*|ice|packed_ice|blue_ice|moss.*|azalea.*|flowering_azalea.*|.*dripleaf|.*fern|.*grass|vine|.*vines|.*lichen|.*flower|.*tulip|.*mushroom|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|lily_pad|cactus|sugar_cane|bamboo|kelp|seagrass|sea_pickle|pumpkin|melon|bee_nest|spore_blossom|hanging_roots|pointed_dripstone|dripstone_block|amethyst.*|.*amethyst_bud|.*amethyst_cluster|sculk.*|sponge|wet_sponge|bedrock|stone|granite|diorite|andesite|deepslate|tuff|calcite|netherrack|end_stone|obsidian|crying_obsidian|basalt|smooth_basalt|blackstone|soul_sand|soul_soil)$/.test(
      n,
    );
  const colored =
    /(_wool|_carpet|_concrete|_concrete_powder|_terracotta|_stained_glass|_stained_glass_pane)$/.test(
      n,
    ) || n === 'terracotta';
  const functional =
    /(_bed|_banner|_sign|_hanging_sign|_candle|_shulker_box)$/.test(n) ||
    /^(crafting_table|furnace|blast_furnace|smoker|chest|trapped_chest|ender_chest|barrel|.*anvil|enchanting_table|bookshelf|chiseled_bookshelf|brewing_stand|cauldron|composter|loom|stonecutter|grindstone|smithing_table|cartography_table|fletching_table|lectern|beacon|conduit|lantern|soul_lantern|torch|soul_torch|campfire|soul_campfire|bell|jukebox|decorated_pot|candle)$/.test(
      n,
    );
  switch (tab) {
    case 'search':
      return true;
    case 'building':
      return (
        !!block && !colored && !natural && !functional && !redstone && !operator
      );
    case 'colored':
      return colored;
    case 'natural':
      return natural;
    case 'functional':
      return functional;
    case 'redstone':
      return redstone;
    case 'tools':
      return tool;
    case 'combat':
      return combat;
    case 'food':
      return !!food;
    case 'eggs':
      return n.endsWith('_spawn_egg');
    case 'operator':
      return operator;
    case 'ingredients':
      return (
        !block &&
        !food &&
        !tool &&
        !combat &&
        !operator &&
        !n.endsWith('_spawn_egg')
      );
    default:
      return false;
  }
}
