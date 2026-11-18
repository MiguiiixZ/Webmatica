/**
 * Fixed biome tints (plains-like values) applied to grayscale textures such as
 * grass, leaves and water. Values are plain RGB colors chosen for this viewer.
 */
export const TINTS: Record<string, number> = {
  grass: 0x91bd59,
  foliage: 0x77ab2f,
  water: 0x3f76e4,
  spruce: 0x619961,
  birch: 0x80a755,
  lily: 0x208030,
  stem: 0x8fbf3a,
  redstone: 0xd02010,
};

const GRASS = new Set([
  'grass_block_top', 'grass_block_side_overlay', 'grass', 'short_grass', 'fern', 'tall_grass_top', 'tall_grass_bottom',
  'large_fern_top', 'large_fern_bottom', 'sugar_cane', 'grass_topextra', 'grass_block_top_extra', 'potted_fern',
]);
const FOLIAGE = new Set(['oak_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'mangrove_leaves', 'vine']);

/** Returns the tint color for a texture name, or 0 when it is not tinted. */
export function tintFor(texture: string): number {
  if (GRASS.has(texture)) return TINTS.grass;
  if (FOLIAGE.has(texture)) return TINTS.foliage;
  if (texture === 'spruce_leaves') return TINTS.spruce;
  if (texture === 'birch_leaves') return TINTS.birch;
  if (texture === 'lily_pad') return TINTS.lily;
  if (texture.startsWith('water_')) return TINTS.water;
  if (texture.includes('_stem') && (texture.startsWith('melon') || texture.startsWith('pumpkin') || texture.startsWith('attached_'))) return TINTS.stem;
  if (texture.startsWith('redstone_dust')) return TINTS.redstone;
  return 0;
}
