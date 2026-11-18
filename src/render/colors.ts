/**
 * Flat colors used when a texture is not available (flat-color mode, or a
 * block the active texture pack does not cover). Primary source: the average
 * color of each texture of the active pack. Fallback: a hand-picked palette
 * keyed by texture/block name, written for this project.
 */
import ppColors from './data/pp-colors.json';

export type Rgba = number; // 0xRRGGBBAA

function parse(hex: string): Rgba {
  const h = hex.length === 6 ? `${hex}ff` : hex;
  return parseInt(h, 16) >>> 0;
}

const EXACT: Record<string, string> = {
  // Newer blocks that older texture packs do not cover.
  deepslate: '505053', deepslate_top: '57575b', cobbled_deepslate: '4d4d51', polished_deepslate: '48484b',
  deepslate_bricks: '464648', cracked_deepslate_bricks: '434345', deepslate_tiles: '363638', cracked_deepslate_tiles: '343436',
  chiseled_deepslate: '363637', reinforced_deepslate_side: '5d6461', tuff: '6c6d66', polished_tuff: '626660', tuff_bricks: '62655d',
  chiseled_tuff: '5c6058', calcite: 'dfe0dc', dripstone_block: '866b5c', pointed_dripstone_up_tip: '8a6f60', amethyst_block: '8662bf',
  budding_amethyst: '84609f', amethyst_cluster: 'a47fcf', smooth_basalt: '48484e', moss_block: '596e2d', moss_carpet: '596e2d',
  azalea_leaves: '5a7426', flowering_azalea_leaves: '646f3e', mud: '3c393c', packed_mud: '8e6b50', mud_bricks: '89684f',
  mangrove_planks: '763631', mangrove_log: '664f2c', mangrove_log_top: '6c2f2b', mangrove_leaves: '5a8a1e', mangrove_roots: '4b3c27',
  muddy_mangrove_roots_side: '443a30', cherry_planks: 'e2b2ac', cherry_log: '3a2025', cherry_log_top: 'b78282', cherry_leaves: 'e5abc2',
  bamboo_planks: 'c3ae53', bamboo_mosaic: 'bea84c', bamboo_block: '7f8f2c', pale_oak_planks: 'e3d9d6', pale_oak_log: '5d5450',
  pale_oak_log_top: 'ccc1bf', pale_oak_leaves: 'a4a69a', pale_moss_block: '6c7466', pale_moss_carpet: '6c7466', sculk: '0c1c23',
  sculk_catalyst_side: '50614f', sculk_sensor: '0f3b46', sculk_shrieker_side: '3c3a35', ochre_froglight_side: 'f6e8b0',
  verdant_froglight_side: 'd6eecc', pearlescent_froglight_side: 'f2e1e6', copper_block: 'c06c50', exposed_copper: 'a17d67',
  weathered_copper: '6d9f6e', oxidized_copper: '52a284', cut_copper: 'bf6b51', exposed_cut_copper: '9a7a65', weathered_cut_copper: '6c996d',
  oxidized_cut_copper: '4f9a7f', raw_iron_block: 'a6876b', raw_copper_block: '9a6a4f', raw_gold_block: 'dda94c', copper_ore: '7d7e78',
  deepslate_copper_ore: '5c5d59', deepslate_iron_ore: '6a6563', deepslate_gold_ore: '73694e', deepslate_coal_ore: '4a4a4c',
  deepslate_diamond_ore: '536a6a', deepslate_emerald_ore: '4f6a58', deepslate_lapis_ore: '4f5a75', deepslate_redstone_ore: '685050',
  tinted_glass: '2c2733c0', powder_snow: 'f8fdfd', lightning_rod: 'c06c50', candle: 'e5d6b0', crafter_south: '74706c',
  trial_spawner_side_inactive: '3b4a54', vault_side_off: '3c4651', heavy_core: '575a62', resin_block: 'd9631b', resin_bricks: 'cf5d1b',
  creaking_heart: '5d5450', chest_entity: '9c6b30', short_grass: '7fb24c', grass: '7fb24c', dirt_path_top: '94793f', dirt_path_side: '846842',
  spore_blossom: 'd9619c', glow_lichen: '76897c', hanging_roots: 'a3745a', big_dripleaf_top: '6f8e2f', small_dripleaf_top: '5f8a2e',
  cave_vines: '5b7a2b', cave_vines_lit: 'a78a3a', firefly_bush: '4f5a2a', leaf_litter: 'a17544', wildflowers: 'c8b347', bush: '6a9a3a',
  short_dry_grass: 'b49a5c', tall_dry_grass: 'b49a5c', cactus_flower: 'e07aa8', closed_eyeblossom: '6d6a63', open_eyeblossom: 'e7a03a',
  torchflower: 'c88a3d', pitcher_plant_top: '6e8ab3', pitcher_plant_bottom: '6a8f45', pink_petals: 'e9a5c5', sniffer_egg_not_cracked_top: 'a64a3a',
  decorated_pot: '985b44', suspicious_sand: 'dad09f', suspicious_gravel: '847e7c', chiseled_bookshelf_side: '7a5c3a', chiseled_bookshelf_top: 'b4935a',
  frogspawn: '6c5f5ac0',
  // Markers drawn around the top of liquid source blocks.
  webmatica_source_water: 'd8f0ffff', webmatica_source_lava: 'ffe24aff', water_still: '3f76e4a0', lava_still: 'd4601a', obsidian: '0f0b19', crying_obsidian: '210a3c',
  iron_chain: '3d4250', chain: '3d4250', copper_chain: 'a65f42', copper_lantern: 'b06a45', copper_torch: 'b06a45', copper_bulb: 'b56c4e',
  copper_grate: 'c06c50', chiseled_copper: 'b86650', dried_ghast: '9b9893',
};

const COLOR_WORDS: [string, string][] = [
  ['light_blue', '3aafd9'], ['light_gray', '8e8e86'], ['magenta', 'bd44b3'], ['orange', 'f07613'], ['yellow', 'f8c527'],
  ['lime', '70b919'], ['pink', 'ed8dac'], ['cyan', '158991'], ['purple', '792aac'], ['brown', '724728'], ['green', '546d1b'],
  ['white', 'e9ecec'], ['gray', '3e4447'], ['blue', '35399d'], ['red', 'a12722'], ['black', '141519'],
];

const KEYWORDS: [string, string][] = [
  ['pale_oak', 'e3d9d6'], ['dark_oak', '4c3323'], ['spruce', '72543a'], ['birch', 'c5b47b'], ['jungle', 'a07350'],
  ['acacia', 'a85a32'], ['mangrove', '763631'], ['cherry', 'e2b2ac'], ['bamboo', 'c3ae53'], ['crimson', '6a344b'],
  ['warped', '2b6963'], ['oak', 'a2834f'], ['deepslate', '4a4a4d'], ['blackstone', '2e292f'], ['basalt', '515156'],
  ['oxidized', '52a284'], ['weathered', '6d9f6e'], ['exposed', 'a17d67'], ['copper', 'c06c50'], ['tuff', '6c6d66'],
  ['granite', '956755'], ['diorite', 'bcbcbc'], ['andesite', '888889'], ['sandstone', 'd8cb9b'], ['sand', 'dbcfa3'],
  ['prismarine', '5fa597'], ['purpur', 'a97ca9'], ['quartz', 'ece6df'], ['nether_brick', '2c1519'], ['netherrack', '6f3534'],
  ['end_stone', 'dbde9e'], ['brick', '966153'], ['mud', '8e6b50'], ['amethyst', '8662bf'], ['dripstone', '866b5c'],
  ['moss', '596e2d'], ['leaves', '4f7a26'], ['coral', 'c8577a'], ['ice', '91b7fdc0'], ['glass', 'c0d8e080'], ['snow', 'f8fdfd'],
  ['stone', '7d7d7d'], ['cobble', '7a7a7a'], ['dirt', '86603e'], ['gravel', '847e7c'], ['clay', 'a0a6b3'], ['wool', 'dddddd'],
  ['terracotta', '985b44'], ['concrete', '808080'], ['iron', 'd8d8d8'], ['gold', 'f6d03d'], ['diamond', '62ede4'],
  ['emerald', '2ccd5a'], ['lapis', '1f4d9a'], ['redstone', 'a51b0a'], ['coal', '262626'], ['obsidian', '0f0b19'],
  ['torch', 'f5c242'], ['lantern', '6a6a72'], ['rail', '7a6a50'], ['flower', 'd05050'], ['tulip', 'd06070'], ['sapling', '4f7a26'],
  ['mushroom', 'a07050'], ['vine', '4f7a26'], ['kelp', '3c7a2c'], ['grass', '7fb24c'], ['fern', '5f9a3a'], ['wheat', 'c8b347'],
  ['pumpkin', 'c67a17'], ['melon', '6f9a2b'], ['hay', 'b19b19'], ['bone', 'e1ddc9'], ['shulker', '976797'], ['sculk', '0c1c23'],
  ['froglight', 'f0e8c0'], ['planks', 'a2834f'], ['log', '6b5232'], ['wood', '6b5232'], ['stem', '6a344b'], ['nylium', '6a344b'],
];

const cache = new Map<string, Rgba>();
const pp = ppColors as Record<string, string>;

/** Fallback flat color for a texture or block name (without namespace). */
export function fallbackColor(name: string): Rgba {
  let c = cache.get(name);
  if (c !== undefined) return c;
  c = parse(computeFallback(name));
  cache.set(name, c);
  return c;
}

function computeFallback(name: string): string {
  if (pp[name]) return pp[name];
  if (EXACT[name]) return EXACT[name];
  const base = name.replace(/^waxed_/, '').replace(/_(top|side|bottom|front|back|end|inner|outer|on|off)$/, '');
  if (pp[base]) return pp[base];
  if (EXACT[base]) return EXACT[base];
  for (const [word, hex] of COLOR_WORDS) {
    if (base.startsWith(`${word}_`)) {
      // Dyed materials: terracotta and glass are muted/transparent variants.
      if (base.includes('terracotta') && !base.includes('glazed')) return mix(hex, '985b44', 0.45);
      if (base.includes('glass')) return `${hex}90`;
      return hex;
    }
  }
  for (const [word, hex] of KEYWORDS) if (base.includes(word)) return hex;
  return 'b0a090';
}

function mix(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(0, 6), 16);
  const cb = parseInt(b.slice(0, 6), 16);
  const ch = (shift: number) => Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t);
  return [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

export function rgbaToCss(c: Rgba): string {
  return `#${(c >>> 8).toString(16).padStart(6, '0')}`;
}
