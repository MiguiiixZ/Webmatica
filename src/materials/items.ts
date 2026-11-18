/**
 * Block state -> required items, following the same rules as Litematica's
 * material list (MaterialCache / MaterialListUtils), re-implemented here:
 *
 *  - the item is the block's own item ("asItem"), which differs from the block
 *    id for wall variants, crops, redstone wire, tripwire, etc.;
 *  - blocks without an item (piston heads, portals, fire, attached stems,
 *    plant bodies...) are not counted;
 *  - the upper half of doors and double plants and the head of beds are not counted;
 *  - water/lava sources count as one bucket, flowing liquid is not counted;
 *  - farmland counts as dirt;
 *  - double slabs count 2, snow layers/turtle eggs/sea pickles/candles count
 *    their amount, glow lichen and sculk veins count one per face;
 *  - waterlogged blocks add one water bucket;
 *  - potted plants count a flower pot plus the plant;
 *  - filled cauldrons count a cauldron plus the bucket or water bottles.
 *
 * Item ids are returned without the "minecraft:" namespace (other namespaces kept).
 */
import type { BlockState } from '../parser/types';

export interface ItemCount {
  item: string;
  count: number;
}

/** Blocks that have no item at all (Block.asItem() is air). */
const NO_ITEM = new Set([
  'air', 'cave_air', 'void_air', 'piston_head', 'moving_piston', 'nether_portal', 'end_portal', 'end_gateway', 'fire',
  'soul_fire', 'frosted_ice', 'bubble_column', 'tall_seagrass', 'attached_pumpkin_stem', 'attached_melon_stem',
  'kelp_plant', 'cave_vines_plant', 'twisting_vines_plant', 'weeping_vines_plant', 'big_dripleaf_stem', 'bamboo_sapling',
  'structure_void',
]);

/** Blocks whose item has a different id. */
const BLOCK_TO_ITEM: Record<string, string> = {
  wall_torch: 'torch',
  soul_wall_torch: 'soul_torch',
  redstone_wall_torch: 'redstone_torch',
  copper_wall_torch: 'copper_torch',
  wheat: 'wheat_seeds',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  pumpkin_stem: 'pumpkin_seeds',
  melon_stem: 'melon_seeds',
  cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries',
  cave_vines: 'glow_berries',
  redstone_wire: 'redstone',
  tripwire: 'string',
  torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod',
  powder_snow: 'powder_snow_bucket',
  farmland: 'dirt',
};

const POTTED_PLANT: Record<string, string> = {
  azalea_bush: 'azalea',
  flowering_azalea_bush: 'flowering_azalea',
};

const DOUBLE_PLANTS = new Set(['tall_grass', 'large_fern', 'sunflower', 'lilac', 'rose_bush', 'peony', 'pitcher_plant', 'small_dripleaf', 'tall_seagrass']);
const MULTIFACE_SPREADING = new Set(['glow_lichen', 'sculk_vein']);
const FACES = ['north', 'south', 'east', 'west', 'up', 'down'];

function split(name: string): [string, string] {
  const i = name.indexOf(':');
  return i < 0 ? ['minecraft', name] : [name.slice(0, i), name.slice(i + 1)];
}

/** The item a block "is" (Block.asItem), or null when it has none. */
export function blockItem(path: string): string | null {
  if (NO_ITEM.has(path)) return null;
  if (path.endsWith('_candle_cake') || path === 'candle_cake') return null;
  const mapped = BLOCK_TO_ITEM[path];
  if (mapped) return mapped;
  // Wall variants share the item of the standing block.
  if (path.endsWith('_wall_torch')) return path.replace('_wall_torch', '_torch');
  if (path.endsWith('_wall_hanging_sign')) return path.replace('_wall_hanging_sign', '_hanging_sign');
  if (path.endsWith('_wall_sign')) return path.replace('_wall_sign', '_sign');
  if (path.endsWith('_wall_banner')) return path.replace('_wall_banner', '_banner');
  if (path.endsWith('_wall_head')) return path.replace('_wall_head', '_head');
  if (path.endsWith('_wall_skull')) return path.replace('_wall_skull', '_skull');
  if (path.endsWith('_coral_wall_fan')) return path.replace('_coral_wall_fan', '_coral_fan');
  return path;
}

/** Items required to place one block of the given state. */
export function itemsForState(state: BlockState): ItemCount[] {
  const [ns, path] = split(state.name);
  const p = state.props;
  const out: ItemCount[] = [];
  const add = (item: string, count = 1) => out.push({ item: ns === 'minecraft' ? item : `${ns}:${item}`, count });

  if (ns !== 'minecraft') {
    add(path);
    if (p.waterlogged === 'true') out.push({ item: 'water_bucket', count: 1 });
    return out;
  }

  // Overrides that yield nothing.
  if (path === 'water' || path === 'lava') {
    if ((p.level ?? '0') === '0') add(`${path}_bucket`);
    return out;
  }
  if (path.endsWith('_door') && p.half === 'upper') return waterlogged(out, p);
  if (path.endsWith('_bed') && p.part === 'head') return out;
  if (DOUBLE_PLANTS.has(path) && p.half === 'upper') return waterlogged(out, p);

  // Multiple items.
  if (path.startsWith('potted_')) {
    add('flower_pot');
    const plant = path.slice(7);
    add(POTTED_PLANT[plant] ?? plant);
    return out;
  }
  if (path === 'water_cauldron') {
    add('cauldron');
    const level = Number(p.level ?? 3);
    if (level >= 3) add('water_bucket');
    else if (level > 0) add('potion', level);
    return out;
  }
  if (path === 'lava_cauldron') {
    add('cauldron');
    add('lava_bucket');
    return out;
  }
  if (path === 'powder_snow_cauldron') {
    add('cauldron');
    add('powder_snow_bucket');
    return out;
  }

  const item = blockItem(path);
  if (item) {
    let count = 1;
    if (path.endsWith('_slab') && p.type === 'double') count = 2;
    else if (path === 'snow') count = Number(p.layers ?? 1);
    else if (path === 'turtle_egg') count = Number(p.eggs ?? 1);
    else if (path === 'sea_pickle') count = Number(p.pickles ?? 1);
    else if (path === 'candle' || path.endsWith('_candle')) count = Number(p.candles ?? 1);
    else if (MULTIFACE_SPREADING.has(path)) count = FACES.filter((f) => p[f] === 'true').length;
    if (count > 0) add(item, count);
  }
  return waterlogged(out, p);
}

function waterlogged(out: ItemCount[], p: Record<string, string>): ItemCount[] {
  if (p.waterlogged === 'true') out.push({ item: 'water_bucket', count: 1 });
  return out;
}

// ---------------------------------------------------------------------------
// Stack sizes
// ---------------------------------------------------------------------------

const STACK_1 = new Set([
  'water_bucket', 'lava_bucket', 'powder_snow_bucket', 'milk_bucket', 'cake', 'potion', 'splash_potion', 'lingering_potion',
  'minecart', 'chest_minecart', 'furnace_minecart', 'tnt_minecart', 'hopper_minecart', 'command_block_minecart', 'saddle',
  'totem_of_undying', 'elytra', 'trident', 'shield', 'bow', 'crossbow', 'fishing_rod', 'flint_and_steel', 'shears', 'mace',
  'enchanted_book', 'writable_book', 'bundle', 'debug_stick', 'knowledge_book', 'spyglass', 'brush', 'goat_horn',
  'carrot_on_a_stick', 'warped_fungus_on_a_stick', 'filled_map', 'mushroom_stew', 'rabbit_stew', 'beetroot_soup',
  'suspicious_stew', 'axolotl_bucket', 'cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket',
  'tadpole_bucket', 'turtle_helmet', 'wolf_armor', 'ominous_bottle',
]);
const STACK_16 = new Set(['ender_pearl', 'snowball', 'egg', 'blue_egg', 'brown_egg', 'bucket', 'armor_stand', 'honey_bottle', 'written_book']);

/** Maximum stack size of an item. */
export function stackSize(item: string): number {
  const path = item.includes(':') ? item.slice(item.indexOf(':') + 1) : item;
  if (STACK_1.has(path)) return 1;
  if (STACK_16.has(path)) return 16;
  if (path.endsWith('_bed') || path.endsWith('shulker_box') || path.endsWith('_boat') || path.endsWith('_raft')) return 1;
  if (path.startsWith('music_disc_') || path.endsWith('_banner_pattern') || path.endsWith('_horse_armor')) return 1;
  if (/_(sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots)$/.test(path)) return 1;
  if (path.endsWith('_sign') || path.endsWith('_hanging_sign') || path.endsWith('_banner')) return 16;
  return 64;
}

export const SHULKER_SLOTS = 27;

export interface Breakdown {
  shulkers: number;
  stacks: number;
  items: number;
}

/** Splits a count into full shulker boxes, full stacks and loose items. */
export function breakdown(total: number, stack: number): Breakdown {
  const perShulker = stack * SHULKER_SLOTS;
  const shulkers = Math.floor(total / perShulker);
  const rest = total - shulkers * perShulker;
  const stacks = Math.floor(rest / stack);
  return { shulkers, stacks, items: rest - stacks * stack };
}

/** Human readable breakdown, e.g. "1 shulker + 17 stacks + 4". */
export function formatBreakdown(total: number, stack: number): string {
  const b = breakdown(total, stack);
  const parts: string[] = [];
  if (b.shulkers) parts.push(`${b.shulkers.toLocaleString('en-US')} ${b.shulkers === 1 ? 'shulker' : 'shulkers'}`);
  if (stack > 1 && b.stacks) parts.push(`${b.stacks} ${b.stacks === 1 ? 'stack' : 'stacks'}`);
  const loose = stack > 1 ? b.items : b.items + b.stacks;
  if (loose || parts.length === 0) parts.push(String(loose));
  return parts.join(' + ');
}
