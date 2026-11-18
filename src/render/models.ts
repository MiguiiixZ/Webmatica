/**
 * Built-in block shapes and texture names.
 *
 * Without the user's client.jar we do not have Minecraft's block models, so
 * this module approximates every block with hand-written boxes (slabs, stairs,
 * fences, panes, doors, plants, torches...). Shapes are written from scratch
 * for this project; texture names follow the standard resource pack layout
 * (textures/block/<name>.png) so that any pack can supply them.
 */
import type { BlockState } from '../parser/types';
import { shortName } from '../parser/types';
import { RenderLayer, type Dir, type ElementDef, type FaceDef, type ModelDef, type QuadDef, type V3 } from './modelTypes';

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'crimson', 'warped', 'bamboo'];
const HORIZONTAL: Dir[] = ['north', 'east', 'south', 'west'];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface CubeTex {
  up: string;
  down: string;
  north: string;
  south: string;
  west: string;
  east: string;
}

function allTex(t: string): CubeTex {
  return { up: t, down: t, north: t, south: t, west: t, east: t };
}

function tbs(top: string, bottom: string, side: string): CubeTex {
  return { up: top, down: bottom, north: side, south: side, west: side, east: side };
}

/** A box; faces touching the block boundary get a cull direction. */
function box(from: V3, to: V3, tex: CubeTex | string, only?: Dir[]): ElementDef {
  const t = typeof tex === 'string' ? allTex(tex) : tex;
  const faces: Partial<Record<Dir, FaceDef>> = {};
  const add = (d: Dir, onEdge: boolean) => {
    if (only && !only.includes(d)) return;
    faces[d] = onEdge ? { tex: t[d], cull: d } : { tex: t[d] };
  };
  add('down', from[1] === 0);
  add('up', to[1] === 16);
  add('north', from[2] === 0);
  add('south', to[2] === 16);
  add('west', from[0] === 0);
  add('east', to[0] === 16);
  return { from, to, faces };
}

/** Rotates a point/box horizontally around the block center, by quarter turns clockwise (seen from above). */
function rotPoint(p: V3, turns: number): V3 {
  let [x, y, z] = p;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [x, z] = [16 - z, x];
  return [x, y, z];
}

const ROT_DIR: Record<Dir, Dir> = { north: 'east', east: 'south', south: 'west', west: 'north', up: 'up', down: 'down' };

function rotDir(d: Dir, turns: number): Dir {
  let r = d;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) r = ROT_DIR[r];
  return r;
}

function rotateElements(els: ElementDef[], turns: number): ElementDef[] {
  if (turns % 4 === 0) return els;
  return els.map((e) => {
    const a = rotPoint(e.from, turns);
    const b = rotPoint(e.to, turns);
    const from: V3 = [Math.min(a[0], b[0]), e.from[1], Math.min(a[2], b[2])];
    const to: V3 = [Math.max(a[0], b[0]), e.to[1], Math.max(a[2], b[2])];
    const faces: Partial<Record<Dir, FaceDef>> = {};
    for (const [d, f] of Object.entries(e.faces) as [Dir, FaceDef][]) {
      faces[rotDir(d, turns)] = f.cull ? { ...f, cull: rotDir(f.cull, turns) } : f;
    }
    return { from, to, faces };
  });
}

/** Quarter turns from north for a horizontal facing. */
function turnsFor(facing: string | undefined): number {
  const i = HORIZONTAL.indexOf((facing ?? 'north') as Dir);
  return i < 0 ? 0 : i;
}

/** Two diagonal quads, like flowers and saplings. */
function cross(tex: string, height = 16, inset = 0.8): QuadDef[] {
  const a = inset;
  const b = 16 - inset;
  const h = height;
  const v0 = 16 - h;
  const q = (p: [V3, V3, V3, V3]): QuadDef => ({
    pos: p,
    uv: [
      [0, 16],
      [16, 16],
      [16, v0],
      [0, v0],
    ],
    tex,
  });
  return [
    q([[a, 0, a], [b, 0, b], [b, h, b], [a, h, a]]),
    q([[b, 0, b], [a, 0, a], [a, h, a], [b, h, b]]),
    q([[a, 0, b], [b, 0, a], [b, h, a], [a, h, b]]),
    q([[b, 0, a], [a, 0, b], [a, h, b], [b, h, a]]),
  ];
}

/** A flat horizontal quad (carpets of petals, lily pads, redstone dust). Visible from both sides. */
function flat(tex: string, y = 0.25): QuadDef[] {
  return [
    { pos: [[0, y, 16], [16, y, 16], [16, y, 0], [0, y, 0]], uv: [[0, 16], [16, 16], [16, 0], [0, 0]], tex },
    { pos: [[0, y, 0], [16, y, 0], [16, y, 16], [0, y, 16]], uv: [[0, 0], [16, 0], [16, 16], [0, 16]], tex },
  ];
}

function model(elements: ElementDef[], opts: Partial<ModelDef> = {}): ModelDef {
  return { elements, layer: RenderLayer.Solid, occludes: false, ...opts };
}

function fullCube(tex: CubeTex | string, opts: Partial<ModelDef> = {}): ModelDef {
  return model([box([0, 0, 0], [16, 16, 16], tex)], { occludes: true, ...opts });
}

function axisCube(side: string, end: string, axis: string | undefined): ModelDef {
  const t = tbs(end, end, side);
  const e = box([0, 0, 0], [16, 16, 16], t);
  if (axis === 'x') {
    e.faces = {
      up: { tex: side, cull: 'up', rot: 90 },
      down: { tex: side, cull: 'down', rot: 90 },
      north: { tex: side, cull: 'north', rot: 90 },
      south: { tex: side, cull: 'south', rot: 90 },
      west: { tex: end, cull: 'west' },
      east: { tex: end, cull: 'east' },
    };
  } else if (axis === 'z') {
    e.faces = {
      up: { tex: side, cull: 'up' },
      down: { tex: side, cull: 'down' },
      north: { tex: end, cull: 'north' },
      south: { tex: end, cull: 'south' },
      west: { tex: side, cull: 'west', rot: 90 },
      east: { tex: side, cull: 'east', rot: 90 },
    };
  }
  return model([e], { occludes: true });
}

/** Cube with a distinct front face (furnace, dispenser...), facing any of the 6 directions. */
function frontCube(front: string, side: string, top: string, bottom: string, facing: string | undefined): ModelDef {
  const t: CubeTex = { up: top, down: bottom, north: side, south: side, west: side, east: side };
  const f = (facing ?? 'north') as Dir;
  if (f === 'up' || f === 'down') {
    t[f] = front;
    t[f === 'up' ? 'down' : 'up'] = bottom;
  } else t[f] = front;
  return fullCube(t);
}

// ---------------------------------------------------------------------------
// Texture names for materials
// ---------------------------------------------------------------------------

/** Texture set of a full block by name (used for the block itself and for its slabs/stairs/walls). */
export function cubeTextures(name: string, props: Record<string, string> = {}): CubeTex {
  const n = name.startsWith('waxed_') ? name.slice(6) : name;
  for (const w of WOODS) {
    if (n === `${w}_log` || n === `stripped_${w}_log`) return tbs(`${n}_top`, `${n}_top`, n);
    if (n === `${w}_wood`) return allTex(`${w}_log`);
    if (n === `stripped_${w}_wood`) return allTex(`stripped_${w}_log`);
  }
  if (n.endsWith('_stem') && (n.includes('crimson') || n.includes('warped'))) return tbs(`${n}_top`, `${n}_top`, n);
  if (n.endsWith('_hyphae')) return allTex(n.replace('_hyphae', '_stem'));
  switch (n) {
    case 'grass_block':
      return props.snowy === 'true' ? tbs('snow', 'dirt', 'grass_block_snow') : tbs('grass_block_top', 'dirt', 'grass_block_side');
    case 'podzol':
      return tbs('podzol_top', 'dirt', 'podzol_side');
    case 'mycelium':
      return tbs('mycelium_top', 'dirt', 'mycelium_side');
    case 'dirt_path':
      return tbs('dirt_path_top|grass_path_top', 'dirt', 'dirt_path_side|grass_path_side');
    case 'farmland':
      return tbs(props.moisture === '7' ? 'farmland_moist' : 'farmland', 'dirt', 'dirt');
    case 'crimson_nylium':
    case 'warped_nylium':
      return tbs(n, 'netherrack', `${n}_side`);
    case 'sandstone':
    case 'red_sandstone':
      return tbs(`${n}_top`, `${n}_bottom`, n);
    case 'cut_sandstone':
    case 'chiseled_sandstone':
      return tbs('sandstone_top', 'sandstone_top', n);
    case 'cut_red_sandstone':
    case 'chiseled_red_sandstone':
      return tbs('red_sandstone_top', 'red_sandstone_top', n);
    case 'smooth_sandstone':
      return allTex('sandstone_top');
    case 'smooth_red_sandstone':
      return allTex('red_sandstone_top');
    case 'quartz_block':
      return tbs('quartz_block_top', 'quartz_block_bottom', 'quartz_block_side');
    case 'smooth_quartz':
      return allTex('quartz_block_bottom');
    case 'quartz':
      return tbs('quartz_block_top', 'quartz_block_bottom', 'quartz_block_side');
    case 'chiseled_quartz_block':
      return tbs('chiseled_quartz_block_top', 'chiseled_quartz_block_top', 'chiseled_quartz_block');
    case 'quartz_bricks':
      return allTex('quartz_bricks');
    case 'smooth_stone':
      return allTex('smooth_stone');
    case 'crafting_table':
      return { up: 'crafting_table_top', down: 'oak_planks', north: 'crafting_table_front', south: 'crafting_table_side', west: 'crafting_table_side', east: 'crafting_table_front' };
    case 'bookshelf':
      return tbs('oak_planks', 'oak_planks', 'bookshelf');
    case 'chiseled_bookshelf':
      return tbs('chiseled_bookshelf_top', 'chiseled_bookshelf_top', 'chiseled_bookshelf_side');
    case 'tnt':
      return tbs('tnt_top', 'tnt_bottom', 'tnt_side');
    case 'pumpkin':
      return tbs('pumpkin_top', 'pumpkin_top', 'pumpkin_side');
    case 'melon':
      return tbs('melon_top', 'melon_top', 'melon_side');
    case 'jukebox':
      return tbs('jukebox_top', 'jukebox_side', 'jukebox_side');
    case 'snow_block':
      return allTex('snow');
    case 'magma_block':
      return allTex('magma');
    case 'cactus':
      return tbs('cactus_top', 'cactus_bottom', 'cactus_side');
    case 'mushroom_stem':
      return allTex('mushroom_stem');
    case 'honey_block':
      return tbs('honey_block_top', 'honey_block_bottom', 'honey_block_side');
    case 'ancient_debris':
      return tbs('ancient_debris_top', 'ancient_debris_top', 'ancient_debris_side');
    case 'dried_kelp_block':
      return tbs('dried_kelp_top', 'dried_kelp_bottom', 'dried_kelp_side');
    case 'target':
      return tbs('target_top', 'target_top', 'target_side');
    case 'lodestone':
      return tbs('lodestone_top', 'lodestone_top', 'lodestone_side');
    case 'blackstone':
      return tbs('blackstone_top', 'blackstone_top', 'blackstone');
    case 'gilded_blackstone':
      return allTex('gilded_blackstone');
    case 'enchanting_table':
      return tbs('enchanting_table_top', 'enchanting_table_bottom', 'enchanting_table_side');
    case 'end_portal_frame':
      return tbs('end_portal_frame_top', 'end_stone', 'end_portal_frame_side');
    case 'scaffolding':
      return tbs('scaffolding_top', 'scaffolding_bottom', 'scaffolding_side');
    case 'composter':
      return tbs('composter_top', 'composter_bottom', 'composter_side');
    case 'reinforced_deepslate':
      return tbs('reinforced_deepslate_top', 'reinforced_deepslate_bottom', 'reinforced_deepslate_side');
    case 'sculk_catalyst':
      return tbs('sculk_catalyst_top', 'sculk_catalyst_bottom', 'sculk_catalyst_side');
    case 'sculk_shrieker':
      return tbs('sculk_shrieker_top', 'sculk_shrieker_bottom', 'sculk_shrieker_side');
    case 'redstone_lamp':
      return allTex(props.lit === 'true' ? 'redstone_lamp_on' : 'redstone_lamp');
    case 'respawn_anchor':
      return tbs('respawn_anchor_top_off|respawn_anchor_top', 'respawn_anchor_bottom', 'respawn_anchor_side0');
    case 'cartography_table':
      return { up: 'cartography_table_top', down: 'dark_oak_planks', north: 'cartography_table_side3', south: 'cartography_table_side1', west: 'cartography_table_side3', east: 'cartography_table_side2' };
    case 'fletching_table':
      return { up: 'fletching_table_top', down: 'birch_planks', north: 'fletching_table_front', south: 'fletching_table_front', west: 'fletching_table_side', east: 'fletching_table_side' };
    case 'smithing_table':
      return { up: 'smithing_table_top', down: 'smithing_table_bottom', north: 'smithing_table_front', south: 'smithing_table_front', west: 'smithing_table_side', east: 'smithing_table_side' };
    case 'stone_bricks':
    case 'stone_brick':
      return allTex('stone_bricks');
    case 'deepslate':
      return tbs('deepslate_top', 'deepslate_top', 'deepslate');
    case 'snow':
      return allTex('snow');
    case 'water':
      return allTex('water_still');
    case 'lava':
      return allTex('lava_still');
    case 'heavy_weighted':
      return allTex('iron_block');
    case 'light_weighted':
      return allTex('gold_block');
    case 'petrified_oak':
      return allTex('oak_planks');
    case 'purpur':
      return allTex('purpur_block');
    case 'grass':
    case 'short_grass':
      return allTex('short_grass|grass');
    case 'trial_spawner':
      return tbs('trial_spawner_top_inactive', 'trial_spawner_bottom', 'trial_spawner_side_inactive');
    case 'vault':
      return tbs('vault_top', 'vault_bottom', 'vault_side_off');
    case 'crafter':
      return tbs('crafter_top', 'crafter_bottom', 'crafter_south');
    case 'bamboo_block':
    case 'stripped_bamboo_block':
      return tbs(`${n}_top`, `${n}_top`, n);
    case 'beehive':
      return { up: 'beehive_end', down: 'beehive_end', north: 'beehive_front', south: 'beehive_side', west: 'beehive_side', east: 'beehive_side' };
    case 'bee_nest':
      return { up: 'bee_nest_top', down: 'bee_nest_bottom', north: 'bee_nest_front', south: 'bee_nest_side', west: 'bee_nest_side', east: 'bee_nest_side' };
  }
  if (n.startsWith('infested_')) return cubeTextures(n.slice(9), props);
  if (n.endsWith('_froglight')) return tbs(`${n}_top`, `${n}_top`, `${n}_side`);
  if (n.endsWith('_concrete_powder') || n.endsWith('_concrete') || n.endsWith('_wool') || n.endsWith('_terracotta')) return allTex(n);
  return allTex(n);
}

/** Maps the material part of "<material>_stairs/_slab/_wall/..." to the full block whose textures it uses. */
export function materialBlock(material: string): string {
  const m = material.startsWith('waxed_') ? material.slice(6) : material;
  if (WOODS.includes(m)) return m === 'bamboo' ? 'bamboo_planks' : `${m}_planks`;
  if (m === 'bamboo_mosaic') return 'bamboo_mosaic';
  if (m.endsWith('_brick')) return `${m}s`;
  if (m.endsWith('_tile')) return `${m}s`;
  const map: Record<string, string> = {
    stone: 'stone',
    cobblestone: 'cobblestone',
    mossy_cobblestone: 'mossy_cobblestone',
    smooth_stone: 'smooth_stone',
    sandstone: 'sandstone',
    red_sandstone: 'red_sandstone',
    cut_sandstone: 'cut_sandstone',
    cut_red_sandstone: 'cut_red_sandstone',
    smooth_sandstone: 'smooth_sandstone',
    smooth_red_sandstone: 'smooth_red_sandstone',
    quartz: 'quartz',
    smooth_quartz: 'smooth_quartz',
    purpur: 'purpur',
    prismarine: 'prismarine',
    dark_prismarine: 'dark_prismarine',
    petrified_oak: 'petrified_oak',
    nether_brick: 'nether_bricks',
    end_stone_brick: 'end_stone_bricks',
    blackstone: 'blackstone',
    polished_blackstone: 'polished_blackstone',
    heavy_weighted: 'heavy_weighted',
    light_weighted: 'light_weighted',
  };
  return map[m] ?? m;
}

const SUFFIXES = ['_stairs', '_slab', '_wall', '_fence_gate', '_fence', '_pressure_plate', '_button'];

function splitMaterial(n: string): [string, string] | null {
  for (const s of SUFFIXES) if (n.endsWith(s)) return [n.slice(0, -s.length), s];
  return null;
}

// ---------------------------------------------------------------------------
// Classification sets
// ---------------------------------------------------------------------------

const INVISIBLE = new Set(['air', 'cave_air', 'void_air', 'structure_void', 'light', 'moving_piston', 'barrier']);

const CROSS_PLANTS = new Set([
  'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip',
  'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'torchflower', 'open_eyeblossom', 'closed_eyeblossom',
  'short_grass', 'grass', 'fern', 'dead_bush', 'sugar_cane', 'cobweb', 'red_mushroom', 'brown_mushroom', 'crimson_fungus',
  'warped_fungus', 'crimson_roots', 'warped_roots', 'nether_sprouts', 'bamboo_sapling', 'kelp', 'kelp_plant', 'seagrass',
  'hanging_roots', 'weeping_vines', 'weeping_vines_plant', 'twisting_vines', 'twisting_vines_plant', 'small_dripleaf',
  'mangrove_propagule', 'firefly_bush', 'bush', 'short_dry_grass', 'tall_dry_grass', 'cactus_flower', 'fire', 'soul_fire',
  'pointed_dripstone', 'amethyst_cluster', 'large_amethyst_bud', 'medium_amethyst_bud', 'small_amethyst_bud', 'cave_vines',
  'cave_vines_plant', 'azalea_bush', 'tripwire', 'pale_hanging_moss', 'spore_blossom',
]);
const TALL_PLANTS = new Set(['tall_grass', 'large_fern', 'sunflower', 'lilac', 'rose_bush', 'peony', 'pitcher_plant', 'tall_seagrass', 'small_dripleaf']);

const TRANSLUCENT_FULL = new Set(['ice', 'tinted_glass', 'frosted_ice']);
// Slime and honey look nearly solid in game (their models have an inner cube): draw them opaque, but keep neighbours visible.
const SOLID_SEE_THROUGH = new Set(['slime_block', 'honey_block']);
const CUTOUT_FULL = new Set(['spawner', 'trial_spawner', 'vault', 'mangrove_roots', 'beacon', 'scaffolding', 'chorus_flower', 'azalea', 'flowering_azalea', 'cauldron', 'water_cauldron', 'lava_cauldron', 'powder_snow_cauldron', 'composter', 'conduit', 'creaking_heart']);

const BED_COLOR: Record<string, string> = {};
const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

function dyeOf(n: string): string | null {
  for (const d of DYES) if (n.startsWith(`${d}_`)) {
    // light_gray / light_blue before gray / blue
    if (d === 'gray' && n.startsWith('light_gray_')) return 'light_gray';
    if (d === 'blue' && n.startsWith('light_blue_')) return 'light_blue';
    return d;
  }
  return null;
}
void BED_COLOR;

function woodOf(n: string): string {
  for (const w of WOODS) if (n.startsWith(`${w}_`)) return w;
  return 'oak';
}

function planksOf(n: string): string {
  const w = woodOf(n);
  return w === 'bamboo' ? 'bamboo_planks' : `${w}_planks`;
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

function slabModel(tex: CubeTex, type: string | undefined): ModelDef {
  if (type === 'double') return fullCube(tex);
  if (type === 'top') return model([box([0, 8, 0], [16, 16, 16], tex)]);
  return model([box([0, 0, 0], [16, 8, 16], tex)]);
}

function stairsModel(tex: CubeTex, props: Record<string, string>): ModelDef {
  const top = props.half === 'top';
  const facing = (props.facing ?? 'north') as Dir;
  const shape = props.shape ?? 'straight';
  const base = top ? box([0, 8, 0], [16, 16, 16], tex) : box([0, 0, 0], [16, 8, 16], tex);
  const y0 = top ? 0 : 8;
  const y1 = top ? 8 : 16;
  // Quadrant cells in the "facing east" frame: [xHalf, zHalf] with 1 = high side.
  // Front = east (x >= 8). Right of east = south (z >= 8), left = north (z < 8).
  let cells: [number, number][];
  switch (shape) {
    case 'outer_right':
      cells = [[1, 1]];
      break;
    case 'outer_left':
      cells = [[1, 0]];
      break;
    case 'inner_right':
      cells = [[1, 0], [1, 1], [0, 1]];
      break;
    case 'inner_left':
      cells = [[1, 0], [1, 1], [0, 0]];
      break;
    default:
      cells = [[1, 0], [1, 1]];
  }
  const steps = cells.map(([cx, cz]) => box([cx * 8, y0, cz * 8], [cx * 8 + 8, y1, cz * 8 + 8], tex));
  // "facing east" frame -> actual facing (east = 1 quarter turn from north).
  const turns = turnsFor(facing) - 1;
  return model([base, ...rotateElements(steps, turns)]);
}

function fenceModel(post: string, props: Record<string, string>): ModelDef {
  const els = [box([6, 0, 6], [10, 16, 10], post)];
  for (const d of HORIZONTAL) {
    if (props[d] !== 'true') continue;
    const t = turnsFor(d);
    els.push(...rotateElements([box([7, 12, 0], [9, 15, 6], post), box([7, 6, 0], [9, 9, 6], post)], t));
  }
  return model(els);
}

function wallModel(tex: CubeTex, props: Record<string, string>): ModelDef {
  const els: ElementDef[] = [];
  const anySide = HORIZONTAL.some((d) => props[d] && props[d] !== 'none' && props[d] !== 'false');
  if (props.up !== 'false' || !anySide) els.push(box([4, 0, 4], [12, 16, 12], tex));
  for (const d of HORIZONTAL) {
    const v = props[d];
    if (!v || v === 'none' || v === 'false') continue;
    const h = v === 'tall' ? 16 : 14;
    els.push(...rotateElements([box([5, 0, 0], [11, h, 8], tex)], turnsFor(d)));
  }
  return model(els);
}

function paneModel(tex: string, edge: string, props: Record<string, string>): ModelDef {
  const t: CubeTex = { up: edge, down: edge, north: tex, south: tex, west: tex, east: tex };
  const els = [box([7, 0, 7], [9, 16, 9], t)];
  for (const d of HORIZONTAL) {
    if (props[d] !== 'true') continue;
    els.push(...rotateElements([box([7, 0, 0], [9, 16, 7], t)], turnsFor(d)));
  }
  return model(els, { layer: RenderLayer.Translucent });
}

function doorModel(n: string, props: Record<string, string>): ModelDef {
  const upper = props.half === 'upper';
  const tex = `${n}_${upper ? 'top' : 'bottom'}`;
  const facing = (props.facing ?? 'north') as Dir;
  // Closed: the panel sits on the side opposite to `facing`.
  let side = ROT_DIR[ROT_DIR[facing]];
  if (props.open === 'true') side = props.hinge === 'right' ? rotDir(facing, 3) : ROT_DIR[facing];
  const el = rotateElements([box([0, 0, 0], [16, 16, 3], tex)], turnsFor(side));
  return model(el);
}

function trapdoorModel(tex: string, props: Record<string, string>): ModelDef {
  if (props.open === 'true') {
    const facing = (props.facing ?? 'north') as Dir;
    const side = ROT_DIR[ROT_DIR[facing]];
    return model(rotateElements([box([0, 0, 0], [16, 16, 3], tex)], turnsFor(side)));
  }
  if (props.half === 'top') return model([box([0, 13, 0], [16, 16, 16], tex)]);
  return model([box([0, 0, 0], [16, 3, 16], tex)]);
}

function gateModel(tex: string, props: Record<string, string>): ModelDef {
  const dy = props.in_wall === 'true' ? -3 : 0;
  const y = (v: number) => Math.max(0, v + dy);
  const els = [box([0, y(5), 7], [2, y(16), 9], tex), box([14, y(5), 7], [16, y(16), 9], tex)];
  if (props.open !== 'true') {
    els.push(box([2, y(6), 7], [14, y(9), 9], tex), box([2, y(12), 7], [14, y(15), 9], tex));
  }
  return model(rotateElements(els, turnsFor(props.facing)));
}

/** Small element attached to a wall (facing away from it) or to the floor/ceiling. */
function attached(from: V3, to: V3, tex: CubeTex | string, face: string | undefined, facing: string | undefined): ModelDef {
  const h = to[1] - from[1];
  const w = to[0] - from[0];
  const d = to[2] - from[2];
  if (face === 'floor') return model([box([8 - w / 2, 0, 8 - d / 2], [8 + w / 2, h, 8 + d / 2], tex)]);
  if (face === 'ceiling') return model([box([8 - w / 2, 16 - h, 8 - d / 2], [8 + w / 2, 16, 8 + d / 2], tex)]);
  // Wall: element lies against the wall on the side opposite to facing.
  const el = box([8 - w / 2, 8 - d / 2, 16 - h], [8 + w / 2, 8 + d / 2, 16], tex);
  return model(rotateElements([el], turnsFor(facing)));
}

function torchModel(tex: string, facing?: string): ModelDef {
  if (!facing) return model([box([7, 0, 7], [9, 10, 9], tex)], { layer: RenderLayer.Solid });
  // Wall torch: offset towards the wall behind it.
  const el = box([7, 3, 11], [9, 13, 13], tex);
  return model(rotateElements([el], turnsFor(facing)));
}

function liquidModel(n: string, level: number): ModelDef {
  const h = level === 0 || level >= 8 ? (level >= 8 ? 16 : 14) : Math.max(2, Math.round(((8 - level) / 9) * 16));
  const tex = n === 'lava' ? 'lava_still' : 'water_still';
  const el = box([0, 0, 0], [16, h, 16], tex);
  if (h < 16) delete el.faces.up?.cull;
  return model([el], {
    layer: n === 'water' ? RenderLayer.Translucent : RenderLayer.Solid,
    cullGroup: n,
    color: n === 'water' ? '3f76e4a0' : undefined,
  });
}

function cropTexture(n: string, age: number): string {
  switch (n) {
    case 'wheat':
      return `wheat_stage${age}`;
    case 'carrots':
    case 'potatoes':
      return `${n}_stage${[0, 0, 1, 1, 2, 2, 2, 3][age] ?? 3}`;
    case 'beetroots':
      return `beetroots_stage${age}`;
    case 'nether_wart':
      return `nether_wart_stage${[0, 1, 1, 2][age] ?? 2}`;
    case 'sweet_berry_bush':
      return `sweet_berry_bush_stage${age}`;
    case 'cocoa':
      return `cocoa_stage${age}`;
    case 'torchflower_crop':
      return `torchflower_crop_stage${age}`;
    case 'pitcher_crop':
      return `pitcher_crop_bottom_stage_${age}`;
    default:
      return n;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const cache = new Map<string, ModelDef>();

export function clearModelCache(): void {
  cache.clear();
}

/** Returns the built-in model for a block state. `key` must uniquely identify the state. */
export function builtinModel(state: BlockState, key: string): ModelDef {
  let m = cache.get(key);
  if (!m) {
    m = computeModel(state);
    cache.set(key, m);
  }
  return m;
}

function computeModel(state: BlockState): ModelDef {
  const full = shortName(state.name);
  const n = full.includes(':') ? full.slice(full.indexOf(':') + 1) : full;
  const p = state.props;

  if (INVISIBLE.has(n)) return model([], { color: n === 'barrier' ? 'ff000040' : undefined });

  if (n === 'water' || n === 'lava' || n === 'bubble_column') return liquidModel(n === 'bubble_column' ? 'water' : n, Number(p.level ?? 0));

  // Material-derived shapes.
  const split = splitMaterial(n);
  if (split) {
    const [mat, suffix] = split;
    const block = materialBlock(mat);
    const tex = cubeTextures(block);
    if (mat === 'smooth_stone' && suffix === '_slab') {
      tex.north = tex.south = tex.west = tex.east = 'smooth_stone_slab_side|smooth_stone';
    }
    switch (suffix) {
      case '_slab':
        return slabModel(tex, p.type);
      case '_stairs':
        return stairsModel(tex, p);
      case '_wall':
        return wallModel(tex, p);
      case '_fence':
        return fenceModel(mat === 'nether_brick' ? 'nether_bricks' : block, p);
      case '_fence_gate':
        return gateModel(block, p);
      case '_pressure_plate':
        return model([box([1, 0, 1], [15, 1, 15], tex.up)]);
      case '_button':
        return attached([0, 0, 0], [6, 2, 4], tex.up, p.face, p.facing);
    }
  }

  // Glass and panes.
  if (n === 'glass' || n.endsWith('_stained_glass') || n === 'tinted_glass') {
    return fullCube(n, { occludes: false, layer: RenderLayer.Translucent, cullGroup: n });
  }
  if (n === 'glass_pane' || n.endsWith('_stained_glass_pane')) {
    const base = n.slice(0, -5);
    return paneModel(base, `${n}_top|${base}`, p);
  }
  if (n === 'iron_bars') return paneModel('iron_bars', 'iron_bars', p);

  if (n.endsWith('_leaves')) {
    return fullCube(n, { occludes: false, cullGroup: 'leaves' });
  }

  // Logs, pillars and other axis blocks.
  if (/_(log|stem|wood|hyphae)$/.test(n) && !n.includes('melon') && !n.includes('pumpkin') && n !== 'mushroom_stem' && n !== 'big_dripleaf_stem') {
    const t = cubeTextures(n);
    return axisCube(t.north, t.up, p.axis);
  }
  switch (n) {
    case 'quartz_pillar':
      return axisCube('quartz_pillar', 'quartz_pillar_top', p.axis);
    case 'purpur_pillar':
      return axisCube('purpur_pillar', 'purpur_pillar_top', p.axis);
    case 'bone_block':
      return axisCube('bone_block_side', 'bone_block_top', p.axis);
    case 'hay_block':
      return axisCube('hay_block_side', 'hay_block_top', p.axis);
    case 'basalt':
    case 'polished_basalt':
      return axisCube(`${n}_side`, `${n}_top`, p.axis);
    case 'deepslate':
      return axisCube('deepslate', 'deepslate_top', p.axis);
    case 'muddy_mangrove_roots':
      return axisCube('muddy_mangrove_roots_side', 'muddy_mangrove_roots_top', p.axis);
    case 'bamboo_block':
    case 'stripped_bamboo_block':
      return axisCube(n, `${n}_top`, p.axis);
    case 'chain':
    case 'iron_chain':
    case 'copper_chain': {
      const els = [box([6.5, 0, 6.5], [9.5, 16, 9.5], n === 'chain' ? 'chain|iron_chain' : n)];
      const axis = p.axis ?? 'y';
      if (axis === 'y') return model(els);
      const e = axis === 'x' ? box([0, 6.5, 6.5], [16, 9.5, 9.5], 'chain|iron_chain') : box([6.5, 6.5, 0], [9.5, 9.5, 16], 'chain|iron_chain');
      return model([e]);
    }
  }
  if (n.endsWith('_froglight')) return axisCube(`${n}_side`, `${n}_top`, p.axis);

  // Cubes with a front face.
  switch (n) {
    case 'furnace':
    case 'blast_furnace':
    case 'smoker': {
      const front = `${n}_front${p.lit === 'true' ? '_on' : ''}|${n}_front`;
      const top = n === 'smoker' ? 'smoker_top' : `${n}_top`;
      const bottom = n === 'smoker' ? 'smoker_bottom' : n === 'blast_furnace' ? 'blast_furnace_top' : 'furnace_top';
      return frontCube(front, `${n}_side`, top, bottom, p.facing);
    }
    case 'dispenser':
    case 'dropper': {
      const vertical = p.facing === 'up' || p.facing === 'down';
      return frontCube(vertical ? `${n}_front_vertical` : `${n}_front`, 'furnace_side', 'furnace_top', 'furnace_top', p.facing);
    }
    case 'observer': {
      const f = (p.facing ?? 'north') as Dir;
      const t: CubeTex = tbs('observer_top', 'observer_top', 'observer_side');
      const opposite: Record<Dir, Dir> = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' };
      t[f] = 'observer_front';
      t[opposite[f]] = p.powered === 'true' ? 'observer_back_on|observer_back' : 'observer_back';
      return fullCube(t);
    }
    case 'piston':
    case 'sticky_piston': {
      const f = (p.facing ?? 'up') as Dir;
      const opposite: Record<Dir, Dir> = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' };
      const t = allTex('piston_side');
      t[f] = p.extended === 'true' ? 'piston_inner' : n === 'sticky_piston' ? 'piston_top_sticky' : 'piston_top';
      t[opposite[f]] = 'piston_bottom';
      return fullCube(t);
    }
    case 'piston_head': {
      const f = (p.facing ?? 'up') as Dir;
      const head = p.type === 'sticky' ? 'piston_top_sticky' : 'piston_top';
      if (f === 'up') return model([box([0, 12, 0], [16, 16, 16], tbs(head, head, 'piston_side')), box([6, 0, 6], [10, 12, 10], 'piston_side')]);
      if (f === 'down') return model([box([0, 0, 0], [16, 4, 16], tbs(head, head, 'piston_side')), box([6, 4, 6], [10, 16, 10], 'piston_side')]);
      const els = [box([0, 0, 0], [16, 16, 4], { ...allTex('piston_side'), north: head }), box([6, 6, 4], [10, 10, 16], 'piston_side')];
      return model(rotateElements(els, turnsFor(f)));
    }
    case 'carved_pumpkin':
    case 'jack_o_lantern': {
      const t = tbs('pumpkin_top', 'pumpkin_top', 'pumpkin_side');
      t[(p.facing ?? 'south') as Dir] = n;
      return fullCube(t);
    }
    case 'barrel': {
      const open = p.open === 'true' ? 'barrel_top_open' : 'barrel_top';
      const f = (p.facing ?? 'up') as Dir;
      if (f === 'up' || f === 'down') return fullCube(tbs(f === 'up' ? open : 'barrel_bottom', f === 'up' ? 'barrel_bottom' : open, 'barrel_side'));
      return axisCube('barrel_side', open, f === 'east' || f === 'west' ? 'x' : 'z');
    }
    case 'loom':
    case 'stonecutter':
    case 'beehive':
    case 'bee_nest':
    case 'crafting_table':
    case 'cartography_table':
    case 'fletching_table':
    case 'smithing_table': {
      if (n === 'stonecutter') return model([box([0, 0, 0], [16, 9, 16], tbs('stonecutter_top', 'stonecutter_bottom', 'stonecutter_side'))]);
      if (n === 'loom') {
        const t: CubeTex = { up: 'loom_top', down: 'loom_bottom', north: 'loom_front', south: 'loom_side', west: 'loom_side', east: 'loom_side' };
        return model(rotateElements([box([0, 0, 0], [16, 16, 16], t)], turnsFor(p.facing) + 2), { occludes: true });
      }
      const t = cubeTextures(n);
      if (n === 'beehive' || n === 'bee_nest') {
        if (p.honey_level === '5') t.north = `${n}_front_honey`;
        return model(rotateElements([box([0, 0, 0], [16, 16, 16], t)], turnsFor(p.facing) + 2), { occludes: true });
      }
      return fullCube(t);
    }
  }

  // Partial blocks.
  if (n === 'snow') return model([box([0, 0, 0], [16, Math.min(16, 2 * Number(p.layers ?? 1)), 16], 'snow')], { occludes: p.layers === '8' });
  if (n.endsWith('_carpet') || n === 'moss_carpet' || n === 'pale_moss_carpet') {
    const tex = n.endsWith('_carpet') && dyeOf(n) ? `${dyeOf(n)}_wool` : n.replace('_carpet', '_block');
    return model([box([0, 0, 0], [16, 1, 16], `${n}|${tex}`)]);
  }
  if (n === 'farmland' || n === 'dirt_path') return model([box([0, 0, 0], [16, 15, 16], cubeTextures(n, p))]);
  if (n.endsWith('_door')) return doorModel(n, p);
  if (n.endsWith('_trapdoor')) return trapdoorModel(n, p);
  if (n === 'ladder') return attached([0, 0, 0], [16, 1, 16], 'ladder', 'wall', p.facing);
  if (n === 'lever') return attached([0, 0, 0], [6, 3, 8], 'cobblestone', p.face, p.facing);
  if (n === 'tripwire_hook') return attached([0, 0, 0], [4, 2, 8], 'tripwire_hook', 'wall', p.facing);
  if (n === 'torch' || n === 'soul_torch' || n === 'redstone_torch' || n === 'copper_torch') {
    const tex = n === 'redstone_torch' && p.lit === 'false' ? 'redstone_torch_off' : n;
    return torchModel(tex);
  }
  if (n === 'wall_torch' || n === 'soul_wall_torch' || n === 'redstone_wall_torch' || n === 'copper_wall_torch') {
    const base = n.replace('_wall_torch', '_torch').replace('wall_torch', 'torch');
    return torchModel(n === 'redstone_wall_torch' && p.lit === 'false' ? 'redstone_torch_off' : base, p.facing);
  }
  if (n === 'lantern' || n === 'soul_lantern' || n.endsWith('copper_lantern')) {
    const dy = p.hanging === 'true' ? 1 : 0;
    return model([box([5, dy, 5], [11, 7 + dy, 11], n), box([6, 7 + dy, 6], [10, 9 + dy, 10], n)]);
  }
  if (n === 'end_rod' || n === 'lightning_rod' || n.endsWith('_lightning_rod')) {
    const f = p.facing ?? 'up';
    const tex = n === 'end_rod' ? 'end_rod' : n.replace('waxed_', '');
    if (f === 'up' || f === 'down') return model([box([6, 0, 6], [10, 16, 10], tex)]);
    return model([f === 'east' || f === 'west' ? box([0, 6, 6], [16, 10, 10], tex) : box([6, 6, 0], [10, 10, 16], tex)]);
  }
  if (n === 'vine' || n === 'glow_lichen' || n === 'sculk_vein' || n === 'resin_clump') {
    const els: ElementDef[] = [];
    const t = n;
    if (p.north === 'true') els.push(box([0, 0, 0], [16, 16, 0.8], t, ['south', 'north']));
    if (p.south === 'true') els.push(box([0, 0, 15.2], [16, 16, 16], t, ['north', 'south']));
    if (p.west === 'true') els.push(box([0, 0, 0], [0.8, 16, 16], t, ['east', 'west']));
    if (p.east === 'true') els.push(box([15.2, 0, 0], [16, 16, 16], t, ['west', 'east']));
    if (p.up === 'true') els.push(box([0, 15.2, 0], [16, 16, 16], t, ['down', 'up']));
    if (p.down === 'true') els.push(box([0, 0, 0], [16, 0.8, 16], t, ['up', 'down']));
    if (els.length === 0) els.push(box([0, 0, 0], [16, 16, 0.8], t, ['south', 'north']));
    return model(els);
  }
  if (n === 'lily_pad') return model([], { quads: flat('lily_pad', 0.25) });
  if (n === 'pink_petals' || n === 'leaf_litter' || n === 'wildflowers' || n === 'frogspawn') return model([], { quads: flat(n, 0.5) });
  if (n === 'redstone_wire') return model([], { quads: flat('redstone_dust_dot', 0.25), color: 'b01008' });
  if (n === 'rail' || n === 'powered_rail' || n === 'detector_rail' || n === 'activator_rail') {
    const on = p.powered === 'true' ? '_on' : '';
    const shape = p.shape ?? 'north_south';
    const tex = n === 'rail' ? (shape.includes('_') && !shape.startsWith('ascending') && shape !== 'north_south' && shape !== 'east_west' ? 'rail_corner' : 'rail') : `${n}${on}|${n}`;
    const q = flat(tex, 0.5);
    return model([], { quads: shape === 'east_west' || shape === 'ascending_east' || shape === 'ascending_west' ? q.map((x) => ({ ...x, uv: [x.uv[1], x.uv[2], x.uv[3], x.uv[0]] as QuadDef['uv'] })) : q });
  }
  if (n === 'repeater' || n === 'comparator') {
    const tex = `${n}${p.powered === 'true' ? '_on' : ''}|${n}`;
    return model([box([0, 0, 0], [16, 2, 16], tbs(tex, 'smooth_stone', 'smooth_stone'))]);
  }
  if (n === 'daylight_detector') {
    const top = p.inverted === 'true' ? 'daylight_detector_inverted_top' : 'daylight_detector_top';
    return model([box([0, 0, 0], [16, 6, 16], tbs(top, 'daylight_detector_side', 'daylight_detector_side'))]);
  }
  if (n === 'chest' || n === 'trapped_chest' || n === 'ender_chest' || n.endsWith('copper_chest')) {
    const color = n === 'ender_chest' ? '1e2a2c' : n.includes('copper') ? 'b4684d' : '9c6b30';
    return model([box([1, 0, 1], [15, 14, 15], n === 'ender_chest' ? 'obsidian' : 'chest_entity')], { color });
  }
  if (n.endsWith('_bed')) {
    const d = dyeOf(n) ?? 'red';
    return model([box([0, 3, 0], [16, 9, 16], `${d}_wool`), box([0, 0, 0], [3, 3, 3], planksOf('oak'))]);
  }
  if (n.endsWith('_wall_hanging_sign')) return model(rotateElements([box([1, 0, 7], [15, 10, 9], planksOf(n))], turnsFor(p.facing)));
  if (n.endsWith('_hanging_sign')) return model([box([1, 0, 7], [15, 10, 9], planksOf(n))]);
  if (n.endsWith('_wall_sign')) return attached([0, 0, 0], [16, 2, 8], planksOf(n), 'wall', p.facing);
  if (n.endsWith('_sign')) return model([box([7.5, 0, 7.5], [8.5, 9, 8.5], `${woodOf(n)}_log`), box([0, 9, 7], [16, 17, 9], planksOf(n))]);
  if (n.endsWith('_wall_banner')) return attached([0, 0, 0], [16, 1, 16], `${dyeOf(n) ?? 'white'}_wool`, 'wall', p.facing);
  if (n.endsWith('_banner')) return model([box([7, 0, 7], [9, 16, 9], 'oak_planks'), box([1, 2, 7.5], [15, 16, 8.5], `${dyeOf(n) ?? 'white'}_wool`)]);
  if (n.endsWith('_wall_head') || n.endsWith('_wall_skull')) return attached([0, 0, 0], [8, 8, 8], 'soul_sand', 'wall', p.facing);
  if (n.endsWith('_head') || n.endsWith('_skull')) return model([box([4, 0, 4], [12, 8, 12], 'soul_sand')], { color: n.includes('wither') ? '2a2a2a' : n.includes('creeper') ? '5fa046' : n.includes('zombie') ? '4a7a3a' : 'd8d8d0' });
  if (n.endsWith('shulker_box')) {
    const d = dyeOf(n);
    return fullCube(d ? `${d}_shulker_box` : 'shulker_box', { color: undefined });
  }
  if (n === 'flower_pot' || n.startsWith('potted_')) {
    const els = [box([5, 0, 5], [11, 6, 11], 'flower_pot')];
    if (n === 'flower_pot') return model(els);
    const plant = n.slice(7);
    if (plant === 'cactus') return model([...els, box([6, 6, 6], [10, 14, 10], 'cactus_side')]);
    const tex = plant === 'azalea_bush' ? 'azalea_top' : plant;
    return model(els, { quads: cross(tex, 10, 3).map((q) => ({ ...q, pos: q.pos.map(([x, y, z]) => [x, y + 4, z]) as QuadDef['pos'] })) });
  }
  if (n === 'cake' || n.endsWith('candle_cake')) {
    const els = [box([1, 0, 1], [15, 8, 15], tbs('cake_top', 'cake_bottom', 'cake_side'))];
    if (n !== 'cake') els.push(box([7, 8, 7], [9, 14, 9], n.replace('_cake', '')));
    return model(els);
  }
  if (n === 'candle' || n.endsWith('_candle')) return model([box([7, 0, 7], [9, 6, 9], n)]);
  if (n === 'sea_pickle') return model([box([6, 0, 6], [10, 6, 10], 'sea_pickle')]);
  if (n === 'turtle_egg' || n === 'sniffer_egg' || n === 'dragon_egg') {
    if (n === 'dragon_egg') return model([box([1, 0, 1], [15, 16, 15], 'dragon_egg')]);
    return model([box([4, 0, 4], [12, 8, 12], n === 'turtle_egg' ? 'turtle_egg' : 'sniffer_egg_not_cracked_top')]);
  }
  if (n === 'enchanting_table') return model([box([0, 0, 0], [16, 12, 16], cubeTextures(n))]);
  if (n === 'end_portal_frame') return model([box([0, 0, 0], [16, 13, 16], cubeTextures(n))]);
  if (n === 'end_portal') return model([box([0, 12, 0], [16, 12.5, 16], 'obsidian')], { color: '0a0a18' });
  if (n === 'end_gateway') return fullCube('obsidian', { color: '0a0a18', occludes: false });
  if (n === 'nether_portal') {
    const e = p.axis === 'z' ? box([6, 0, 0], [10, 16, 16], 'nether_portal') : box([0, 0, 6], [16, 16, 10], 'nether_portal');
    return model([e], { layer: RenderLayer.Translucent, cullGroup: 'portal', color: '7a2cc0b0' });
  }
  if (n === 'campfire' || n === 'soul_campfire') return model([box([0, 0, 0], [16, 7, 16], tbs('campfire_log', 'campfire_log', 'campfire_log'))], { color: '6b5236' });
  if (n === 'lectern') return model([box([0, 0, 0], [16, 2, 16], 'lectern_base'), box([4, 2, 4], [12, 13, 12], 'lectern_front'), box([0, 12, 0], [16, 16, 16], 'lectern_top')]);
  if (n === 'brewing_stand') return model([box([1, 0, 1], [15, 2, 15], 'brewing_stand_base'), box([7, 2, 7], [9, 14, 9], 'brewing_stand')]);
  if (n === 'hopper') {
    return model([
      box([0, 10, 0], [16, 16, 16], tbs('hopper_top', 'hopper_outside', 'hopper_outside')),
      box([4, 4, 4], [12, 10, 12], 'hopper_outside'),
      box([6, 0, 6], [10, 4, 10], 'hopper_outside'),
    ]);
  }
  if (n === 'anvil' || n === 'chipped_anvil' || n === 'damaged_anvil') {
    const top = n === 'anvil' ? 'anvil_top' : `${n}_top`;
    const els = [box([2, 0, 2], [14, 4, 14], 'anvil'), box([4, 4, 3], [12, 10, 13], 'anvil'), box([0, 10, 3], [16, 16, 13], tbs(top, 'anvil', 'anvil'))];
    return model(rotateElements(els, turnsFor(p.facing) + 1));
  }
  if (n === 'grindstone') return model([box([4, 4, 2], [12, 16, 14], 'grindstone_side')]);
  if (n === 'bell') return model([box([4, 4, 4], [12, 13, 12], 'gold_block'), box([2, 13, 7], [14, 15, 9], 'dark_oak_planks')]);
  if (n === 'cactus') return model([box([1, 0, 1], [15, 16, 15], cubeTextures('cactus'))]);
  if (n === 'bamboo') return model([box([6.5, 0, 6.5], [9.5, 16, 9.5], 'bamboo_stalk')]);
  if (n === 'chorus_plant') return model([box([3, 3, 3], [13, 13, 13], 'chorus_plant')]);
  if (n === 'chorus_flower') return model([box([2, 2, 2], [14, 14, 14], 'chorus_flower')]);
  if (n === 'conduit') return model([box([5, 5, 5], [11, 11, 11], 'conduit')]);
  if (n === 'heavy_core') return model([box([4, 0, 4], [12, 8, 12], 'heavy_core')]);
  if (n === 'decorated_pot') return model([box([1, 0, 1], [15, 16, 15], 'terracotta')]);
  if (n === 'big_dripleaf') return model([box([0, 11, 0], [16, 15, 16], tbs('big_dripleaf_top', 'big_dripleaf_top', 'big_dripleaf_side'))], { quads: cross('big_dripleaf_stem', 11) });
  if (n === 'big_dripleaf_stem') return model([], { quads: cross('big_dripleaf_stem') });
  if (n === 'azalea' || n === 'flowering_azalea') return model([box([0, 8, 0], [16, 16, 16], tbs(`${n}_top`, `${n}_top`, `${n}_side`))], { quads: cross('azalea_plant', 8) });
  if (n === 'cauldron' || n.endsWith('_cauldron')) {
    const els = [box([0, 3, 0], [16, 16, 16], tbs('cauldron_top', 'cauldron_bottom', 'cauldron_side'))];
    return model(els);
  }
  if (n === 'composter') return model([box([0, 0, 0], [16, 16, 16], cubeTextures(n))]);
  if (n === 'scaffolding') return model([box([0, 0, 0], [16, 16, 16], cubeTextures(n))], { cullGroup: 'scaffolding' });
  if (n === 'pointed_dripstone') return model([], { quads: cross('pointed_dripstone_up_tip') });
  if (n === 'seagrass' || n === 'kelp' || n === 'kelp_plant') return model([], { quads: cross(n) });

  // Crops and plants.
  const age = Number(p.age ?? 0);
  if (['wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart', 'sweet_berry_bush', 'torchflower_crop', 'pitcher_crop'].includes(n)) {
    return model([], { quads: cross(cropTexture(n, age)) });
  }
  if (n === 'cocoa') return model(rotateElements([box([5, 3, 9], [11, 10, 15], cropTexture(n, age))], turnsFor(p.facing) + 2));
  if (n === 'pumpkin_stem' || n === 'melon_stem') return model([], { quads: cross(n, Math.min(16, 2 + age * 2)) });
  if (n === 'attached_pumpkin_stem' || n === 'attached_melon_stem') return model([], { quads: cross(n) });
  if (TALL_PLANTS.has(n)) {
    const upper = p.half === 'upper';
    let tex = `${n}_${upper ? 'top' : 'bottom'}`;
    if (n === 'sunflower') tex = upper ? 'sunflower_top' : 'sunflower_bottom';
    if (n === 'small_dripleaf') tex = 'small_dripleaf_top';
    return model([], { quads: cross(tex) });
  }
  if (n.endsWith('_sapling') || n.endsWith('_coral') || n.endsWith('_coral_fan') || n.endsWith('_coral_wall_fan') || n.endsWith('_mushroom') && !n.includes('block')) {
    const tex = n.replace('_wall_fan', '_fan');
    return model([], { quads: cross(tex) });
  }
  if (CROSS_PLANTS.has(n)) {
    let tex = n;
    if (n === 'short_grass' || n === 'grass') tex = 'short_grass|grass';
    if (n === 'fire') tex = 'fire_0';
    if (n === 'soul_fire') tex = 'soul_fire_0';
    if (n === 'cave_vines' || n === 'cave_vines_plant') tex = p.berries === 'true' ? `${n}_lit` : n;
    if (n === 'tripwire') return model([], { quads: flat('tripwire', 1.5) });
    return model([], { quads: cross(tex) });
  }

  // Full cubes with special render layers.
  if (TRANSLUCENT_FULL.has(n)) return fullCube(cubeTextures(n, p), { occludes: false, layer: RenderLayer.Translucent, cullGroup: n });
  if (CUTOUT_FULL.has(n) || SOLID_SEE_THROUGH.has(n)) return fullCube(cubeTextures(n, p), { occludes: false, cullGroup: n });
  if (n.includes('copper_grate')) return fullCube(n.replace('waxed_', ''), { occludes: false, cullGroup: n });

  // Default: an opaque full cube.
  const tex = cubeTextures(n, p);
  return fullCube(tex);
}
