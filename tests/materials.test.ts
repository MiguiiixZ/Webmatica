import { describe, expect, it } from 'vitest';
import { breakdown, formatBreakdown, itemsForState, stackSize } from '../src/materials/items';
import { buildMaterialList, sortMaterials, toCsv, toText } from '../src/materials/materialList';
import { displayName } from '../src/materials/names';
import { S } from './helpers';

const items = (name: string, props: Record<string, string> = {}) => itemsForState(S(name, props));

describe('shulker / stack / item breakdown', () => {
  it('splits counts for stacks of 64', () => {
    // 1 shulker = 27 * 64 = 1728
    expect(breakdown(1728, 64)).toEqual({ shulkers: 1, stacks: 0, items: 0 });
    expect(breakdown(1532, 64)).toEqual({ shulkers: 0, stacks: 23, items: 60 });
    expect(breakdown(2820, 64)).toEqual({ shulkers: 1, stacks: 17, items: 4 });
    expect(breakdown(0, 64)).toEqual({ shulkers: 0, stacks: 0, items: 0 });
    expect(breakdown(63, 64)).toEqual({ shulkers: 0, stacks: 0, items: 63 });
    expect(breakdown(64, 64)).toEqual({ shulkers: 0, stacks: 1, items: 0 });
    expect(breakdown(1729, 64)).toEqual({ shulkers: 1, stacks: 0, items: 1 });
  });

  it('splits counts for stacks of 16 and 1', () => {
    // 27 * 16 = 432 per shulker
    expect(breakdown(450, 16)).toEqual({ shulkers: 1, stacks: 1, items: 2 });
    // Unstackable: 27 per shulker
    expect(breakdown(30, 1)).toEqual({ shulkers: 1, stacks: 3, items: 0 });
  });

  it('formats breakdowns', () => {
    expect(formatBreakdown(2820, 64)).toBe('1 shulker + 17 stacks + 4');
    expect(formatBreakdown(1532, 64)).toBe('23 stacks + 60');
    expect(formatBreakdown(3456, 64)).toBe('2 shulkers');
    expect(formatBreakdown(64, 64)).toBe('1 stack');
    expect(formatBreakdown(5, 64)).toBe('5');
    expect(formatBreakdown(30, 1)).toBe('1 shulker + 3');
    expect(formatBreakdown(0, 64)).toBe('0');
  });

  it('knows real stack sizes', () => {
    expect(stackSize('stone')).toBe(64);
    expect(stackSize('oak_sign')).toBe(16);
    expect(stackSize('bamboo_hanging_sign')).toBe(16);
    expect(stackSize('white_banner')).toBe(16);
    expect(stackSize('ender_pearl')).toBe(16);
    expect(stackSize('snowball')).toBe(16);
    expect(stackSize('red_bed')).toBe(1);
    expect(stackSize('shulker_box')).toBe(1);
    expect(stackSize('lime_shulker_box')).toBe(1);
    expect(stackSize('water_bucket')).toBe(1);
    expect(stackSize('cake')).toBe(1);
    expect(stackSize('diamond_pickaxe')).toBe(1);
    expect(stackSize('potion')).toBe(1);
    expect(stackSize('oak_door')).toBe(64);
  });
});

describe('block to item rules (Litematica compatible)', () => {
  it('uses the block item for normal blocks', () => {
    expect(items('stone')).toEqual([{ item: 'stone', count: 1 }]);
    expect(items('oak_stairs', { facing: 'north', waterlogged: 'false' })).toEqual([{ item: 'oak_stairs', count: 1 }]);
  });

  it('counts doors, beds and tall plants once', () => {
    expect(items('oak_door', { half: 'lower' })).toEqual([{ item: 'oak_door', count: 1 }]);
    expect(items('oak_door', { half: 'upper' })).toEqual([]);
    expect(items('red_bed', { part: 'foot' })).toEqual([{ item: 'red_bed', count: 1 }]);
    expect(items('red_bed', { part: 'head' })).toEqual([]);
    expect(items('sunflower', { half: 'lower' })).toEqual([{ item: 'sunflower', count: 1 }]);
    expect(items('sunflower', { half: 'upper' })).toEqual([]);
  });

  it('counts double slabs as 2 and layered blocks by amount', () => {
    expect(items('oak_slab', { type: 'double', waterlogged: 'false' })).toEqual([{ item: 'oak_slab', count: 2 }]);
    expect(items('oak_slab', { type: 'top', waterlogged: 'false' })).toEqual([{ item: 'oak_slab', count: 1 }]);
    expect(items('snow', { layers: '5' })).toEqual([{ item: 'snow', count: 5 }]);
    expect(items('sea_pickle', { pickles: '3', waterlogged: 'true' })).toEqual([{ item: 'sea_pickle', count: 3 }, { item: 'water_bucket', count: 1 }]);
    expect(items('red_candle', { candles: '4', lit: 'false' })).toEqual([{ item: 'red_candle', count: 4 }]);
    expect(items('turtle_egg', { eggs: '2' })).toEqual([{ item: 'turtle_egg', count: 2 }]);
    expect(items('glow_lichen', { north: 'true', up: 'true', south: 'false' })).toEqual([{ item: 'glow_lichen', count: 2 }]);
  });

  it('maps liquids to buckets and ignores flowing liquid', () => {
    expect(items('water', { level: '0' })).toEqual([{ item: 'water_bucket', count: 1 }]);
    expect(items('lava', { level: '0' })).toEqual([{ item: 'lava_bucket', count: 1 }]);
    expect(items('water', { level: '3' })).toEqual([]);
  });

  it('adds a water bucket for waterlogged blocks', () => {
    expect(items('stone_brick_slab', { type: 'bottom', waterlogged: 'true' })).toEqual([
      { item: 'stone_brick_slab', count: 1 },
      { item: 'water_bucket', count: 1 },
    ]);
  });

  it('maps blocks whose item differs', () => {
    expect(items('wall_torch', { facing: 'east' })).toEqual([{ item: 'torch', count: 1 }]);
    expect(items('redstone_wall_torch', { facing: 'east', lit: 'true' })).toEqual([{ item: 'redstone_torch', count: 1 }]);
    expect(items('oak_wall_sign', { facing: 'east' })).toEqual([{ item: 'oak_sign', count: 1 }]);
    expect(items('skeleton_wall_skull', { facing: 'east' })).toEqual([{ item: 'skeleton_skull', count: 1 }]);
    expect(items('player_wall_head')).toEqual([{ item: 'player_head', count: 1 }]);
    expect(items('brain_coral_wall_fan')).toEqual([{ item: 'brain_coral_fan', count: 1 }]);
    expect(items('wheat', { age: '7' })).toEqual([{ item: 'wheat_seeds', count: 1 }]);
    expect(items('carrots', { age: '7' })).toEqual([{ item: 'carrot', count: 1 }]);
    expect(items('redstone_wire')).toEqual([{ item: 'redstone', count: 1 }]);
    expect(items('tripwire')).toEqual([{ item: 'string', count: 1 }]);
    expect(items('farmland', { moisture: '7' })).toEqual([{ item: 'dirt', count: 1 }]);
    expect(items('cocoa')).toEqual([{ item: 'cocoa_beans', count: 1 }]);
  });

  it('ignores blocks without an item', () => {
    for (const b of ['piston_head', 'moving_piston', 'nether_portal', 'end_portal', 'fire', 'kelp_plant', 'attached_melon_stem', 'tall_seagrass']) {
      expect(items(b), b).toEqual([]);
    }
  });

  it('counts pots, plants and cauldron contents', () => {
    expect(items('potted_poppy')).toEqual([{ item: 'flower_pot', count: 1 }, { item: 'poppy', count: 1 }]);
    expect(items('potted_azalea_bush')).toEqual([{ item: 'flower_pot', count: 1 }, { item: 'azalea', count: 1 }]);
    expect(items('water_cauldron', { level: '3' })).toEqual([{ item: 'cauldron', count: 1 }, { item: 'water_bucket', count: 1 }]);
    expect(items('water_cauldron', { level: '2' })).toEqual([{ item: 'cauldron', count: 1 }, { item: 'potion', count: 2 }]);
    expect(items('lava_cauldron')).toEqual([{ item: 'cauldron', count: 1 }, { item: 'lava_bucket', count: 1 }]);
  });

  it('keeps modded namespaces', () => {
    expect(items('create:shaft', { axis: 'y' })).toEqual([{ item: 'create:shaft', count: 1 }]);
  });
});

describe('material list', () => {
  const palette = [
    S('air'),
    S('oak_planks'),
    S('oak_slab', { type: 'double', waterlogged: 'false' }),
    S('oak_slab', { type: 'bottom', waterlogged: 'true' }),
    S('oak_door', { half: 'lower' }),
    S('oak_door', { half: 'upper' }),
    S('water', { level: '0' }),
  ];
  const counts = [0, 1532, 10, 5, 2, 2, 3];
  const list = buildMaterialList(palette, counts);
  const byItem = Object.fromEntries(list.map((e) => [e.item, e]));

  it('aggregates by item', () => {
    expect(byItem.oak_planks.total).toBe(1532);
    expect(byItem.oak_slab.total).toBe(10 * 2 + 5);
    expect(byItem.oak_slab.paletteIds).toEqual([2, 3]);
    expect(byItem.oak_door.total).toBe(2);
    expect(byItem.water_bucket.total).toBe(5 + 3);
    expect(byItem.water_bucket.paletteIds).toEqual([3, 6]);
    expect(list.length).toBe(4);
  });

  it('sorts by amount, name and status', () => {
    const collected = new Set(['oak_planks']);
    expect(sortMaterials(list, 'count', collected).map((e) => e.item)).toEqual(['oak_planks', 'oak_slab', 'water_bucket', 'oak_door']);
    expect(sortMaterials(list, 'name', collected).map((e) => e.item)).toEqual(['oak_door', 'oak_planks', 'oak_slab', 'water_bucket']);
    expect(sortMaterials(list, 'status', collected).map((e) => e.item)).toEqual(['oak_slab', 'water_bucket', 'oak_door', 'oak_planks']);
  });

  it('exports CSV and text', () => {
    const collected = new Set(['oak_planks']);
    const csv = toCsv(sortMaterials(list, 'count', collected), collected);
    expect(csv.split('\r\n')[0]).toBe('Item,Item ID,Total,Shulker Boxes,Stacks,Items,Stack Size,Collected');
    expect(csv).toContain('Oak Planks,minecraft:oak_planks,1532,0,23,60,64,yes');
    expect(csv).toContain('Water Bucket,minecraft:water_bucket,8,0,0,8,1,no');
    const text = toText(sortMaterials(list, 'count', collected), collected, 'Test');
    expect(text).toContain('[x] Oak Planks');
    expect(text).toContain('23 stacks + 60');
  });

  it('generates readable English names', () => {
    expect(displayName('minecraft:oak_planks')).toBe('Oak Planks');
    expect(displayName('shulker_box')).toBe('Shulker Box');
    expect(displayName('lily_of_the_valley')).toBe('Lily of the Valley');
    expect(displayName('tnt')).toBe('TNT');
    expect(displayName('redstone')).toBe('Redstone Dust');
    expect(displayName('create:mechanical_press')).toBe('Mechanical Press (create)');
  });
});
