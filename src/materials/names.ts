/**
 * English display names for block and item ids.
 *
 * Names come from the user's client.jar language file when one is loaded;
 * otherwise they are generated from the id ("oak_planks" -> "Oak Planks") with
 * a short list of exceptions where the generated name would be wrong.
 */

const OVERRIDES: Record<string, string> = {
  tnt: 'TNT',
  tnt_minecart: 'Minecart with TNT',
  redstone: 'Redstone Dust',
  redstone_wire: 'Redstone Wire',
  jack_o_lantern: "Jack o'Lantern",
  lily_of_the_valley: 'Lily of the Valley',
  experience_bottle: "Bottle o' Enchanting",
  mushroom_stem: 'Mushroom Stem',
  short_grass: 'Short Grass',
  grass: 'Grass',
  sugar_cane: 'Sugar Cane',
  cocoa_beans: 'Cocoa Beans',
  nether_wart: 'Nether Wart',
  wheat_seeds: 'Wheat Seeds',
  dirt_path: 'Dirt Path',
  grass_path: 'Grass Path',
  powder_snow_bucket: 'Powder Snow Bucket',
  end_crystal: 'End Crystal',
  smooth_quartz: 'Smooth Quartz Block',
  quartz_block: 'Block of Quartz',
  iron_block: 'Block of Iron',
  gold_block: 'Block of Gold',
  diamond_block: 'Block of Diamond',
  emerald_block: 'Block of Emerald',
  lapis_block: 'Block of Lapis Lazuli',
  redstone_block: 'Block of Redstone',
  coal_block: 'Block of Coal',
  netherite_block: 'Block of Netherite',
  copper_block: 'Block of Copper',
  amethyst_block: 'Block of Amethyst',
  raw_iron_block: 'Block of Raw Iron',
  raw_gold_block: 'Block of Raw Gold',
  raw_copper_block: 'Block of Raw Copper',
  bamboo_block: 'Block of Bamboo',
  stripped_bamboo_block: 'Block of Stripped Bamboo',
  resin_block: 'Block of Resin',
  waxed_copper_block: 'Waxed Block of Copper',
  lapis_ore: 'Lapis Lazuli Ore',
  deepslate_lapis_ore: 'Deepslate Lapis Lazuli Ore',
  nether_quartz_ore: 'Nether Quartz Ore',
  snow: 'Snow',
  snow_block: 'Snow Block',
  melon: 'Melon',
  spawner: 'Monster Spawner',
  cobweb: 'Cobweb',
  water_bucket: 'Water Bucket',
  lava_bucket: 'Lava Bucket',
  potion: 'Water Bottle',
  carrot: 'Carrot',
  potato: 'Potato',
  beetroot_seeds: 'Beetroot Seeds',
  pumpkin_seeds: 'Pumpkin Seeds',
  melon_seeds: 'Melon Seeds',
  torchflower_seeds: 'Torchflower Seeds',
  pitcher_pod: 'Pitcher Pod',
  sweet_berries: 'Sweet Berries',
  glow_berries: 'Glow Berries',
  string: 'String',
  heavy_weighted_pressure_plate: 'Heavy Weighted Pressure Plate',
  light_weighted_pressure_plate: 'Light Weighted Pressure Plate',
  moving_piston: 'Moving Piston',
  piston_head: 'Piston Head',
  scute: 'Scute',
  dragon_head: 'Dragon Head',
  player_head: 'Player Head',
  end_rod: 'End Rod',
  chain: 'Chain',
  iron_chain: 'Iron Chain',
};

const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'on', 'with', 'and', 'o']);

/** Custom names loaded from a client.jar (keys like "oak_planks"). */
let langNames: Map<string, string> | null = null;

export function setLanguageNames(map: Map<string, string> | null): void {
  langNames = map;
}

/** Display name for a namespaced or plain id. */
export function displayName(id: string): string {
  const colon = id.indexOf(':');
  const ns = colon >= 0 ? id.slice(0, colon) : 'minecraft';
  const path = colon >= 0 ? id.slice(colon + 1) : id;
  if (ns === 'minecraft') {
    const fromLang = langNames?.get(path);
    if (fromLang) return fromLang;
    const o = OVERRIDES[path];
    if (o) return o;
  }
  const words = path.split(/[_/]+/).filter(Boolean);
  const name = words
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  return ns === 'minecraft' ? name : `${name} (${ns})`;
}

/** Extracts block and item names from a Minecraft en_us.json language file. */
export function parseLanguageFile(json: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(json)) {
    const m = /^(block|item)\.minecraft\.([a-z0-9_]+)$/.exec(k);
    if (!m) continue;
    // Item names win for ids that are both (e.g. potions); block names otherwise.
    if (m[1] === 'item' || !map.has(m[2])) map.set(m[2], v);
  }
  return map;
}
