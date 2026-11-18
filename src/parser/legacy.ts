/**
 * Conversion of pre-1.13 ("legacy", Minecraft 1.12 and older) block states to
 * modern flattened ids, so that the rest of the app only deals with one naming
 * scheme. Covers vanilla 1.12 blocks; properties that only matter for the old
 * format (variant, color, type...) are folded into the id.
 *
 * Also contains the numeric id table used for MCEdit/WorldEdit `.schematic`
 * files (Blocks/Data arrays).
 */
import type { BlockState } from './types';

const COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
];
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];

function color(c: string | undefined): string {
  if (!c || c === 'silver') return c === 'silver' ? 'light_gray' : 'white';
  return c;
}

/** Blocks that were only renamed (no property folding). */
const RENAMES: Record<string, string> = {
  grass: 'grass_block',
  web: 'cobweb',
  deadbush: 'dead_bush',
  reeds: 'sugar_cane',
  waterlily: 'lily_pad',
  melon_block: 'melon',
  mob_spawner: 'spawner',
  portal: 'nether_portal',
  brick_block: 'bricks',
  nether_brick: 'nether_bricks',
  red_nether_brick: 'red_nether_bricks',
  magma: 'magma_block',
  noteblock: 'note_block',
  golden_rail: 'powered_rail',
  quartz_ore: 'nether_quartz_ore',
  hardened_clay: 'terracotta',
  slime: 'slime_block',
  end_bricks: 'end_stone_bricks',
  yellow_flower: 'dandelion',
  piston_extension: 'moving_piston',
  lit_pumpkin: 'jack_o_lantern',
  snow_layer: 'snow',
  snow: 'snow_block',
  stone_stairs: 'cobblestone_stairs',
  wooden_door: 'oak_door',
  trapdoor: 'oak_trapdoor',
  wooden_pressure_plate: 'oak_pressure_plate',
  wooden_button: 'oak_button',
  fence: 'oak_fence',
  fence_gate: 'oak_fence_gate',
  flowing_water: 'water',
  flowing_lava: 'lava',
  silver_shulker_box: 'light_gray_shulker_box',
  silver_glazed_terracotta: 'light_gray_glazed_terracotta',
  grass_path: 'dirt_path',
  standing_sign: 'oak_sign',
  wall_sign: 'oak_wall_sign',
  standing_banner: 'white_banner',
  wall_banner: 'white_wall_banner',
  bed: 'red_bed',
  stone_slab2: 'red_sandstone_slab',
  double_stone_slab2: 'red_sandstone_slab',
  purpur_double_slab: 'purpur_slab',
  unpowered_repeater: 'repeater',
  powered_repeater: 'repeater',
  unpowered_comparator: 'comparator',
  powered_comparator: 'comparator',
  unlit_redstone_torch: 'redstone_torch',
  lit_redstone_lamp: 'redstone_lamp',
  lit_redstone_ore: 'redstone_ore',
  lit_furnace: 'furnace',
  daylight_detector_inverted: 'daylight_detector',
  monster_egg: 'infested_stone',
  chorus_flower: 'chorus_flower',
  end_portal_frame: 'end_portal_frame',
};

/** States that carried a "lit"/"powered"/"inverted" flag via a separate legacy block id. */
const FLAG_FROM_NAME: Record<string, [string, string]> = {
  lit_furnace: ['lit', 'true'],
  furnace: ['lit', 'false'],
  lit_redstone_lamp: ['lit', 'true'],
  redstone_lamp: ['lit', 'false'],
  lit_redstone_ore: ['lit', 'true'],
  redstone_ore: ['lit', 'false'],
  powered_repeater: ['powered', 'true'],
  unpowered_repeater: ['powered', 'false'],
  powered_comparator: ['powered', 'true'],
  unpowered_comparator: ['powered', 'false'],
  daylight_detector_inverted: ['inverted', 'true'],
  daylight_detector: ['inverted', 'false'],
  unlit_redstone_torch: ['lit', 'false'],
  redstone_torch: ['lit', 'true'],
};

const STONE_VARIANTS: Record<string, string> = {
  stone: 'stone',
  granite: 'granite',
  smooth_granite: 'polished_granite',
  diorite: 'diorite',
  smooth_diorite: 'polished_diorite',
  andesite: 'andesite',
  smooth_andesite: 'polished_andesite',
};

const SLAB_VARIANTS: Record<string, string> = {
  stone: 'smooth_stone_slab',
  sand: 'sandstone_slab',
  wood_old: 'petrified_oak_slab',
  cobblestone: 'cobblestone_slab',
  brick: 'brick_slab',
  stone_brick: 'stone_brick_slab',
  nether_brick: 'nether_brick_slab',
  quartz: 'quartz_slab',
};

const DOUBLE_SLAB_SEAMLESS: Record<string, string> = {
  stone: 'smooth_stone',
  sand: 'smooth_sandstone',
  quartz: 'smooth_quartz',
};

const RED_FLOWERS: Record<string, string> = {
  poppy: 'poppy',
  blue_orchid: 'blue_orchid',
  allium: 'allium',
  houstonia: 'azure_bluet',
  red_tulip: 'red_tulip',
  orange_tulip: 'orange_tulip',
  white_tulip: 'white_tulip',
  pink_tulip: 'pink_tulip',
  oxeye_daisy: 'oxeye_daisy',
};

const DOUBLE_PLANTS: Record<string, string> = {
  sunflower: 'sunflower',
  syringa: 'lilac',
  double_grass: 'tall_grass',
  double_fern: 'large_fern',
  double_rose: 'rose_bush',
  paeonia: 'peony',
};

const MONSTER_EGG: Record<string, string> = {
  stone: 'infested_stone',
  cobblestone: 'infested_cobblestone',
  stone_brick: 'infested_stone_bricks',
  mossy_brick: 'infested_mossy_stone_bricks',
  cracked_brick: 'infested_cracked_stone_bricks',
  chiseled_brick: 'infested_chiseled_stone_bricks',
};

const COLORED = new Set([
  'wool', 'stained_glass', 'stained_glass_pane', 'stained_hardened_clay', 'carpet', 'concrete', 'concrete_powder',
]);
const COLORED_TARGET: Record<string, string> = {
  wool: 'wool',
  stained_glass: 'stained_glass',
  stained_glass_pane: 'stained_glass_pane',
  stained_hardened_clay: 'terracotta',
  carpet: 'carpet',
  concrete: 'concrete',
  concrete_powder: 'concrete_powder',
};

/** Legacy block names that do not exist in 1.13+, used to detect legacy palettes without a data version. */
const LEGACY_ONLY = new Set([
  'wool', 'stained_hardened_clay', 'planks', 'log', 'log2', 'leaves2', 'stonebrick', 'red_flower', 'yellow_flower',
  'double_plant', 'tallgrass', 'wooden_slab', 'double_wooden_slab', 'stone_slab2', 'double_stone_slab', 'lit_furnace',
  'reeds', 'web', 'deadbush', 'waterlily', 'melon_block', 'mob_spawner', 'brick_block', 'noteblock', 'golden_rail',
  'quartz_ore', 'hardened_clay', 'magma', 'monster_egg', 'snow_layer', 'standing_sign', 'wall_sign', 'unpowered_repeater',
  'powered_repeater', 'unlit_redstone_torch', 'lit_redstone_lamp', 'wooden_door', 'wooden_button', 'wooden_pressure_plate',
  'stained_glass', 'stained_glass_pane', 'carpet', 'concrete', 'concrete_powder', 'skull', 'flower_pot', 'lit_pumpkin',
]);

export function looksLegacy(names: string[]): boolean {
  for (const n of names) {
    const s = n.startsWith('minecraft:') ? n.slice(10) : n;
    if (LEGACY_ONLY.has(s) && s !== 'flower_pot' && s !== 'carpet') return true;
  }
  return false;
}

function axisFromLog(axis: string | undefined): string {
  return axis === 'x' || axis === 'z' ? axis : 'y';
}

/** Converts one 1.12 block state to its modern equivalent. */
export function convertLegacyState(input: BlockState): BlockState {
  const ns = input.name.indexOf(':');
  const namespace = ns >= 0 ? input.name.slice(0, ns) : 'minecraft';
  if (namespace !== 'minecraft') return input;
  const n = ns >= 0 ? input.name.slice(ns + 1) : input.name;
  const p = { ...input.props };
  const out = (name: string, props: Record<string, string> = p): BlockState => ({ name: `minecraft:${name}`, props });
  const drop = (...keys: string[]) => {
    for (const k of keys) delete p[k];
  };

  if (COLORED.has(n)) {
    const c = color(p.color);
    drop('color');
    return out(`${c}_${COLORED_TARGET[n]}`);
  }

  switch (n) {
    case 'stone': {
      const v = STONE_VARIANTS[p.variant ?? 'stone'] ?? 'stone';
      drop('variant');
      return out(v);
    }
    case 'dirt': {
      const v = p.variant === 'coarse_dirt' ? 'coarse_dirt' : p.variant === 'podzol' ? 'podzol' : 'dirt';
      drop('variant', 'snowy');
      return out(v);
    }
    case 'planks': {
      const w = p.variant ?? 'oak';
      drop('variant');
      return out(`${w}_planks`);
    }
    case 'sapling': {
      const w = p.type ?? 'oak';
      drop('type');
      return out(`${w}_sapling`);
    }
    case 'sand': {
      const v = p.variant === 'red_sand' ? 'red_sand' : 'sand';
      drop('variant');
      return out(v);
    }
    case 'log':
    case 'log2': {
      const w = p.variant ?? (n === 'log' ? 'oak' : 'acacia');
      const axis = p.axis;
      drop('variant', 'axis');
      if (axis === 'none') return out(`${w}_wood`, { axis: 'y' });
      return out(`${w}_log`, { axis: axisFromLog(axis) });
    }
    case 'leaves':
    case 'leaves2': {
      const w = p.variant ?? (n === 'leaves' ? 'oak' : 'acacia');
      const persistent = p.decayable === 'false' ? 'true' : 'false';
      drop('variant', 'decayable', 'check_decay');
      return out(`${w}_leaves`, { persistent, distance: '7' });
    }
    case 'sponge': {
      const wet = p.wet === 'true';
      drop('wet');
      return out(wet ? 'wet_sponge' : 'sponge');
    }
    case 'sandstone':
    case 'red_sandstone': {
      const t = p.type ?? 'default';
      const base = n;
      drop('type');
      if (t === 'chiseled_sandstone' || t === 'chiseled_red_sandstone') return out(`chiseled_${base}`);
      if (t === 'smooth_sandstone' || t === 'smooth_red_sandstone') return out(`cut_${base}`);
      return out(base);
    }
    case 'tallgrass': {
      const t = p.type ?? 'tall_grass';
      drop('type');
      if (t === 'dead_bush') return out('dead_bush');
      if (t === 'fern') return out('fern');
      return out('short_grass');
    }
    case 'red_flower': {
      const t = RED_FLOWERS[p.type ?? 'poppy'] ?? 'poppy';
      drop('type');
      return out(t);
    }
    case 'double_plant': {
      const t = DOUBLE_PLANTS[p.variant ?? 'sunflower'] ?? 'sunflower';
      drop('variant', 'facing');
      return out(t, { half: p.half === 'upper' ? 'upper' : 'lower' });
    }
    case 'stone_slab':
    case 'double_stone_slab': {
      const v = p.variant ?? 'stone';
      if (n === 'double_stone_slab' && p.seamless === 'true' && DOUBLE_SLAB_SEAMLESS[v]) {
        return out(DOUBLE_SLAB_SEAMLESS[v], {});
      }
      const slab = SLAB_VARIANTS[v] ?? 'smooth_stone_slab';
      const type = n === 'double_stone_slab' ? 'double' : p.half === 'top' ? 'top' : 'bottom';
      return out(slab, { type, waterlogged: 'false' });
    }
    case 'stone_slab2':
    case 'double_stone_slab2': {
      if (n === 'double_stone_slab2' && p.seamless === 'true') return out('smooth_red_sandstone', {});
      const type = n === 'double_stone_slab2' ? 'double' : p.half === 'top' ? 'top' : 'bottom';
      return out('red_sandstone_slab', { type, waterlogged: 'false' });
    }
    case 'purpur_slab':
    case 'purpur_double_slab': {
      const type = n === 'purpur_double_slab' ? 'double' : p.half === 'top' ? 'top' : 'bottom';
      return out('purpur_slab', { type, waterlogged: 'false' });
    }
    case 'wooden_slab':
    case 'double_wooden_slab': {
      const w = p.variant ?? 'oak';
      const type = n === 'double_wooden_slab' ? 'double' : p.half === 'top' ? 'top' : 'bottom';
      return out(`${w}_slab`, { type, waterlogged: 'false' });
    }
    case 'stonebrick': {
      const v = p.variant ?? 'stonebrick';
      drop('variant');
      const map: Record<string, string> = {
        stonebrick: 'stone_bricks',
        mossy_stonebrick: 'mossy_stone_bricks',
        cracked_stonebrick: 'cracked_stone_bricks',
        chiseled_stonebrick: 'chiseled_stone_bricks',
      };
      return out(map[v] ?? 'stone_bricks');
    }
    case 'quartz_block': {
      const v = p.variant ?? 'default';
      drop('variant');
      if (v === 'chiseled') return out('chiseled_quartz_block');
      if (v.startsWith('lines_')) return out('quartz_pillar', { axis: v.slice(6) });
      return out('quartz_block');
    }
    case 'purpur_pillar':
      return out('purpur_pillar', { axis: axisFromLog(p.axis) });
    case 'hay_block':
    case 'bone_block':
      return out(n, { axis: axisFromLog(p.axis) });
    case 'prismarine': {
      const v = p.variant ?? 'prismarine';
      drop('variant');
      if (v === 'prismarine_bricks') return out('prismarine_bricks');
      if (v === 'dark_prismarine') return out('dark_prismarine');
      return out('prismarine');
    }
    case 'monster_egg': {
      const v = MONSTER_EGG[p.variant ?? 'stone'] ?? 'infested_stone';
      drop('variant');
      return out(v);
    }
    case 'cobblestone_wall': {
      const v = p.variant === 'mossy_cobblestone' ? 'mossy_cobblestone_wall' : 'cobblestone_wall';
      drop('variant');
      return out(v);
    }
    case 'anvil': {
      const d = p.damage ?? '0';
      drop('damage');
      return out(d === '1' ? 'chipped_anvil' : d === '2' ? 'damaged_anvil' : 'anvil');
    }
    case 'torch':
    case 'redstone_torch':
    case 'unlit_redstone_torch': {
      const facing = p.facing ?? 'up';
      const base = n === 'torch' ? 'torch' : 'redstone_torch';
      const props: Record<string, string> = {};
      if (base === 'redstone_torch') props.lit = n === 'unlit_redstone_torch' ? 'false' : 'true';
      if (facing === 'up') return out(base, props);
      return out(base === 'torch' ? 'wall_torch' : 'redstone_wall_torch', { ...props, facing });
    }
    case 'pumpkin': {
      // 1.12 placed pumpkins always had a face; the modern equivalent is the carved pumpkin.
      return out('carved_pumpkin', { facing: p.facing ?? 'south' });
    }
    case 'skull': {
      const facing = p.facing ?? 'up';
      if (facing === 'up' || facing === 'down') return out('skeleton_skull', { rotation: '0' });
      return out('skeleton_wall_skull', { facing });
    }
    case 'flower_pot': {
      const c = p.contents ?? 'empty';
      if (c === 'empty') return out('flower_pot', {});
      const map: Record<string, string> = {
        rose: 'poppy', blue_orchid: 'blue_orchid', allium: 'allium', houstonia: 'azure_bluet', red_tulip: 'red_tulip',
        orange_tulip: 'orange_tulip', white_tulip: 'white_tulip', pink_tulip: 'pink_tulip', oxeye_daisy: 'oxeye_daisy',
        dandelion: 'dandelion', oak_sapling: 'oak_sapling', spruce_sapling: 'spruce_sapling',
        birch_sapling: 'birch_sapling', jungle_sapling: 'jungle_sapling', acacia_sapling: 'acacia_sapling',
        dark_oak_sapling: 'dark_oak_sapling', mushroom_red: 'red_mushroom', mushroom_brown: 'brown_mushroom',
        dead_bush: 'dead_bush', fern: 'fern', cactus: 'cactus',
      };
      return out(`potted_${map[c] ?? 'poppy'}`, {});
    }
    case 'brown_mushroom_block':
    case 'red_mushroom_block': {
      const v = p.variant ?? 'all_outside';
      if (v === 'stem' || v === 'all_stem') return out('mushroom_stem', {});
      return out(n, {});
    }
    case 'grass':
      drop('snowy');
      return out('grass_block', { snowy: 'false' });
  }

  if (n in FLAG_FROM_NAME) {
    const [k, v] = FLAG_FROM_NAME[n];
    p[k] = v;
  }
  if (n.endsWith('_slab') && p.half && !p.type) {
    p.type = p.half === 'top' ? 'top' : 'bottom';
    drop('half');
  }
  const renamed = RENAMES[n];
  if (renamed) return out(renamed);
  // Colored wood variants that already used modern-ish names (oak_stairs, spruce_fence...) pass through.
  return out(n);
}

// ---------------------------------------------------------------------------
// Numeric ids (MCEdit .schematic)
// ---------------------------------------------------------------------------

/** 1.12 numeric block ids -> legacy names (index = id). */
const LEGACY_IDS: string[] = [];
(function initIds() {
  const list: [number, string][] = [
    [0, 'air'], [1, 'stone'], [2, 'grass'], [3, 'dirt'], [4, 'cobblestone'], [5, 'planks'], [6, 'sapling'],
    [7, 'bedrock'], [8, 'flowing_water'], [9, 'water'], [10, 'flowing_lava'], [11, 'lava'], [12, 'sand'],
    [13, 'gravel'], [14, 'gold_ore'], [15, 'iron_ore'], [16, 'coal_ore'], [17, 'log'], [18, 'leaves'],
    [19, 'sponge'], [20, 'glass'], [21, 'lapis_ore'], [22, 'lapis_block'], [23, 'dispenser'], [24, 'sandstone'],
    [25, 'noteblock'], [26, 'bed'], [27, 'golden_rail'], [28, 'detector_rail'], [29, 'sticky_piston'], [30, 'web'],
    [31, 'tallgrass'], [32, 'deadbush'], [33, 'piston'], [34, 'piston_head'], [35, 'wool'], [36, 'piston_extension'],
    [37, 'yellow_flower'], [38, 'red_flower'], [39, 'brown_mushroom'], [40, 'red_mushroom'], [41, 'gold_block'],
    [42, 'iron_block'], [43, 'double_stone_slab'], [44, 'stone_slab'], [45, 'brick_block'], [46, 'tnt'],
    [47, 'bookshelf'], [48, 'mossy_cobblestone'], [49, 'obsidian'], [50, 'torch'], [51, 'fire'], [52, 'mob_spawner'],
    [53, 'oak_stairs'], [54, 'chest'], [55, 'redstone_wire'], [56, 'diamond_ore'], [57, 'diamond_block'],
    [58, 'crafting_table'], [59, 'wheat'], [60, 'farmland'], [61, 'furnace'], [62, 'lit_furnace'],
    [63, 'standing_sign'], [64, 'wooden_door'], [65, 'ladder'], [66, 'rail'], [67, 'stone_stairs'], [68, 'wall_sign'],
    [69, 'lever'], [70, 'stone_pressure_plate'], [71, 'iron_door'], [72, 'wooden_pressure_plate'], [73, 'redstone_ore'],
    [74, 'lit_redstone_ore'], [75, 'unlit_redstone_torch'], [76, 'redstone_torch'], [77, 'stone_button'],
    [78, 'snow_layer'], [79, 'ice'], [80, 'snow'], [81, 'cactus'], [82, 'clay'], [83, 'reeds'], [84, 'jukebox'],
    [85, 'fence'], [86, 'pumpkin'], [87, 'netherrack'], [88, 'soul_sand'], [89, 'glowstone'], [90, 'portal'],
    [91, 'lit_pumpkin'], [92, 'cake'], [93, 'unpowered_repeater'], [94, 'powered_repeater'], [95, 'stained_glass'],
    [96, 'trapdoor'], [97, 'monster_egg'], [98, 'stonebrick'], [99, 'brown_mushroom_block'],
    [100, 'red_mushroom_block'], [101, 'iron_bars'], [102, 'glass_pane'], [103, 'melon_block'], [104, 'pumpkin_stem'],
    [105, 'melon_stem'], [106, 'vine'], [107, 'fence_gate'], [108, 'brick_stairs'], [109, 'stone_brick_stairs'],
    [110, 'mycelium'], [111, 'waterlily'], [112, 'nether_brick'], [113, 'nether_brick_fence'],
    [114, 'nether_brick_stairs'], [115, 'nether_wart'], [116, 'enchanting_table'], [117, 'brewing_stand'],
    [118, 'cauldron'], [119, 'end_portal'], [120, 'end_portal_frame'], [121, 'end_stone'], [122, 'dragon_egg'],
    [123, 'redstone_lamp'], [124, 'lit_redstone_lamp'], [125, 'double_wooden_slab'], [126, 'wooden_slab'],
    [127, 'cocoa'], [128, 'sandstone_stairs'], [129, 'emerald_ore'], [130, 'ender_chest'], [131, 'tripwire_hook'],
    [132, 'tripwire'], [133, 'emerald_block'], [134, 'spruce_stairs'], [135, 'birch_stairs'], [136, 'jungle_stairs'],
    [137, 'command_block'], [138, 'beacon'], [139, 'cobblestone_wall'], [140, 'flower_pot'], [141, 'carrots'],
    [142, 'potatoes'], [143, 'wooden_button'], [144, 'skull'], [145, 'anvil'], [146, 'trapped_chest'],
    [147, 'light_weighted_pressure_plate'], [148, 'heavy_weighted_pressure_plate'], [149, 'unpowered_comparator'],
    [150, 'powered_comparator'], [151, 'daylight_detector'], [152, 'redstone_block'], [153, 'quartz_ore'],
    [154, 'hopper'], [155, 'quartz_block'], [156, 'quartz_stairs'], [157, 'activator_rail'], [158, 'dropper'],
    [159, 'stained_hardened_clay'], [160, 'stained_glass_pane'], [161, 'leaves2'], [162, 'log2'],
    [163, 'acacia_stairs'], [164, 'dark_oak_stairs'], [165, 'slime'], [166, 'barrier'], [167, 'iron_trapdoor'],
    [168, 'prismarine'], [169, 'sea_lantern'], [170, 'hay_block'], [171, 'carpet'], [172, 'hardened_clay'],
    [173, 'coal_block'], [174, 'packed_ice'], [175, 'double_plant'], [176, 'standing_banner'], [177, 'wall_banner'],
    [178, 'daylight_detector_inverted'], [179, 'red_sandstone'], [180, 'red_sandstone_stairs'],
    [181, 'double_stone_slab2'], [182, 'stone_slab2'], [183, 'spruce_fence_gate'], [184, 'birch_fence_gate'],
    [185, 'jungle_fence_gate'], [186, 'dark_oak_fence_gate'], [187, 'acacia_fence_gate'], [188, 'spruce_fence'],
    [189, 'birch_fence'], [190, 'jungle_fence'], [191, 'dark_oak_fence'], [192, 'acacia_fence'], [193, 'spruce_door'],
    [194, 'birch_door'], [195, 'jungle_door'], [196, 'acacia_door'], [197, 'dark_oak_door'], [198, 'end_rod'],
    [199, 'chorus_plant'], [200, 'chorus_flower'], [201, 'purpur_block'], [202, 'purpur_pillar'],
    [203, 'purpur_stairs'], [204, 'purpur_double_slab'], [205, 'purpur_slab'], [206, 'end_bricks'],
    [207, 'beetroots'], [208, 'grass_path'], [209, 'end_gateway'], [210, 'repeating_command_block'],
    [211, 'chain_command_block'], [212, 'frosted_ice'], [213, 'magma'], [214, 'nether_wart_block'],
    [215, 'red_nether_brick'], [216, 'bone_block'], [217, 'structure_void'], [218, 'observer'],
    [219, 'white_shulker_box'], [220, 'orange_shulker_box'], [221, 'magenta_shulker_box'],
    [222, 'light_blue_shulker_box'], [223, 'yellow_shulker_box'], [224, 'lime_shulker_box'],
    [225, 'pink_shulker_box'], [226, 'gray_shulker_box'], [227, 'silver_shulker_box'], [228, 'cyan_shulker_box'],
    [229, 'purple_shulker_box'], [230, 'blue_shulker_box'], [231, 'brown_shulker_box'], [232, 'green_shulker_box'],
    [233, 'red_shulker_box'], [234, 'black_shulker_box'], [235, 'white_glazed_terracotta'],
    [236, 'orange_glazed_terracotta'], [237, 'magenta_glazed_terracotta'], [238, 'light_blue_glazed_terracotta'],
    [239, 'yellow_glazed_terracotta'], [240, 'lime_glazed_terracotta'], [241, 'pink_glazed_terracotta'],
    [242, 'gray_glazed_terracotta'], [243, 'silver_glazed_terracotta'], [244, 'cyan_glazed_terracotta'],
    [245, 'purple_glazed_terracotta'], [246, 'blue_glazed_terracotta'], [247, 'brown_glazed_terracotta'],
    [248, 'green_glazed_terracotta'], [249, 'red_glazed_terracotta'], [250, 'black_glazed_terracotta'],
    [251, 'concrete'], [252, 'concrete_powder'], [255, 'structure_block'],
  ];
  for (const [id, name] of list) LEGACY_IDS[id] = name;
})();

const STAIR_FACING = ['east', 'west', 'south', 'north'];
const FACING_2D_SNWE = ['south', 'west', 'north', 'east']; // bed, repeater, comparator, fence gate, pumpkin: data & 3
const FACING_6 = ['down', 'up', 'north', 'south', 'west', 'east'];
const TORCH_FACING = ['up', 'east', 'west', 'south', 'north', 'up'];
const DOOR_FACING = ['east', 'south', 'west', 'north'];
const LADDER_FACING: Record<number, string> = { 2: 'north', 3: 'south', 4: 'west', 5: 'east' };
const TRAPDOOR_FACING = ['north', 'south', 'west', 'east'];

function isStairs(name: string): boolean {
  return name.endsWith('_stairs');
}

/** Builds a legacy (1.12-named) state from a numeric id and 4-bit data value. */
export function legacyFromNumeric(id: number, data: number): BlockState | null {
  const name = LEGACY_IDS[id];
  if (!name) return null;
  const props: Record<string, string> = {};
  const d = data & 15;
  if (COLORED.has(name)) props.color = COLORS[d];
  else if (name.endsWith('_shulker_box') || name.endsWith('_glazed_terracotta')) {
    props.facing = FACING_6[d % 6];
  } else
    switch (name) {
      case 'stone':
        props.variant = ['stone', 'granite', 'smooth_granite', 'diorite', 'smooth_diorite', 'andesite', 'smooth_andesite'][d] ?? 'stone';
        break;
      case 'dirt':
        props.variant = ['dirt', 'coarse_dirt', 'podzol'][d] ?? 'dirt';
        break;
      case 'planks':
      case 'double_wooden_slab':
        props.variant = WOODS[d & 7] ?? 'oak';
        break;
      case 'wooden_slab':
        props.variant = WOODS[d & 7] ?? 'oak';
        props.half = d & 8 ? 'top' : 'bottom';
        break;
      case 'sapling':
        props.type = WOODS[d & 7] ?? 'oak';
        break;
      case 'sand':
        props.variant = d === 1 ? 'red_sand' : 'sand';
        break;
      case 'log':
        props.variant = WOODS[d & 3];
        props.axis = ['y', 'x', 'z', 'none'][d >> 2];
        break;
      case 'log2':
        props.variant = WOODS[4 + (d & 1)];
        props.axis = ['y', 'x', 'z', 'none'][d >> 2];
        break;
      case 'leaves':
        props.variant = WOODS[d & 3];
        props.decayable = d & 4 ? 'false' : 'true';
        break;
      case 'leaves2':
        props.variant = WOODS[4 + (d & 1)];
        props.decayable = d & 4 ? 'false' : 'true';
        break;
      case 'sponge':
        props.wet = d & 1 ? 'true' : 'false';
        break;
      case 'sandstone':
        props.type = ['default', 'chiseled_sandstone', 'smooth_sandstone'][d] ?? 'default';
        break;
      case 'red_sandstone':
        props.type = ['default', 'chiseled_red_sandstone', 'smooth_red_sandstone'][d] ?? 'default';
        break;
      case 'tallgrass':
        props.type = ['dead_bush', 'tall_grass', 'fern'][d] ?? 'tall_grass';
        break;
      case 'red_flower':
        props.type = ['poppy', 'blue_orchid', 'allium', 'houstonia', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'][d] ?? 'poppy';
        break;
      case 'double_plant':
        if (d & 8) props.half = 'upper';
        else {
          props.half = 'lower';
          props.variant = ['sunflower', 'syringa', 'double_grass', 'double_fern', 'double_rose', 'paeonia'][d & 7] ?? 'sunflower';
        }
        break;
      case 'stone_slab':
      case 'double_stone_slab':
        props.variant = ['stone', 'sand', 'wood_old', 'cobblestone', 'brick', 'stone_brick', 'nether_brick', 'quartz'][d & 7];
        if (name === 'stone_slab') props.half = d & 8 ? 'top' : 'bottom';
        else if (d & 8) props.seamless = 'true';
        break;
      case 'stone_slab2':
      case 'purpur_slab':
        props.half = d & 8 ? 'top' : 'bottom';
        break;
      case 'double_stone_slab2':
        if (d & 8) props.seamless = 'true';
        break;
      case 'stonebrick':
        props.variant = ['stonebrick', 'mossy_stonebrick', 'cracked_stonebrick', 'chiseled_stonebrick'][d] ?? 'stonebrick';
        break;
      case 'quartz_block':
        props.variant = ['default', 'chiseled', 'lines_y', 'lines_x', 'lines_z'][d] ?? 'default';
        break;
      case 'prismarine':
        props.variant = ['prismarine', 'prismarine_bricks', 'dark_prismarine'][d] ?? 'prismarine';
        break;
      case 'monster_egg':
        props.variant = ['stone', 'cobblestone', 'stone_brick', 'mossy_brick', 'cracked_brick', 'chiseled_brick'][d] ?? 'stone';
        break;
      case 'cobblestone_wall':
        props.variant = d === 1 ? 'mossy_cobblestone' : 'cobblestone';
        break;
      case 'anvil':
        props.damage = String(d >> 2);
        props.facing = FACING_2D_SNWE[d & 3];
        break;
      case 'torch':
      case 'redstone_torch':
      case 'unlit_redstone_torch':
        props.facing = TORCH_FACING[d] ?? 'up';
        break;
      case 'pumpkin':
      case 'lit_pumpkin':
        props.facing = FACING_2D_SNWE[d & 3];
        break;
      case 'purpur_pillar':
      case 'hay_block':
      case 'bone_block':
        props.axis = ['y', 'x', 'z'][d >> 2] ?? 'y';
        break;
      case 'water':
      case 'flowing_water':
      case 'lava':
      case 'flowing_lava':
        props.level = String(d);
        break;
      case 'snow_layer':
        props.layers = String((d & 7) + 1);
        break;
      case 'bed':
        props.facing = FACING_2D_SNWE[d & 3];
        props.part = d & 8 ? 'head' : 'foot';
        break;
      case 'wooden_door':
      case 'iron_door':
      case 'spruce_door':
      case 'birch_door':
      case 'jungle_door':
      case 'acacia_door':
      case 'dark_oak_door':
        if (d & 8) {
          props.half = 'upper';
          props.hinge = d & 1 ? 'right' : 'left';
        } else {
          props.half = 'lower';
          props.facing = DOOR_FACING[d & 3];
          props.open = d & 4 ? 'true' : 'false';
        }
        break;
      case 'ladder':
      case 'wall_sign':
      case 'wall_banner':
      case 'chest':
      case 'trapped_chest':
      case 'ender_chest':
      case 'furnace':
      case 'lit_furnace':
        props.facing = LADDER_FACING[d] ?? 'north';
        break;
      case 'trapdoor':
      case 'iron_trapdoor':
        props.facing = TRAPDOOR_FACING[d & 3];
        props.half = d & 8 ? 'top' : 'bottom';
        props.open = d & 4 ? 'true' : 'false';
        break;
      case 'unpowered_repeater':
      case 'powered_repeater':
      case 'unpowered_comparator':
      case 'powered_comparator':
      case 'fence_gate':
      case 'spruce_fence_gate':
      case 'birch_fence_gate':
      case 'jungle_fence_gate':
      case 'dark_oak_fence_gate':
      case 'acacia_fence_gate':
        props.facing = FACING_2D_SNWE[d & 3];
        break;
      case 'dispenser':
      case 'dropper':
      case 'observer':
      case 'piston':
      case 'sticky_piston':
      case 'hopper':
      case 'end_rod':
        props.facing = FACING_6[d & 7] ?? 'down';
        break;
      case 'skull':
        props.facing = FACING_6[d & 7] ?? 'up';
        break;
      case 'brown_mushroom_block':
      case 'red_mushroom_block':
        props.variant = d === 10 || d === 15 ? 'stem' : 'all_outside';
        break;
      case 'wheat':
      case 'carrots':
      case 'potatoes':
        props.age = String(d & 7);
        break;
    }
  if (isStairs(name)) {
    props.facing = STAIR_FACING[d & 3];
    props.half = d & 4 ? 'top' : 'bottom';
  }
  return { name: `minecraft:${name}`, props };
}
