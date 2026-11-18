/**
 * Generates the bundled example schematic (public/examples/example-cottage.litematic).
 * The build is an original design created for this project and is released
 * under CC0 together with the file.
 *
 * Usage: npm run make-example
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { litematicaBits, pack } from '../src/parser/bits';
import { tag, TagType, writeNbt, type Tagged } from '../src/parser/nbt';
import { stateKey, type BlockState } from '../src/parser/types';

const SX = 13;
const SY = 9;
const SZ = 13;

const palette: BlockState[] = [{ name: 'minecraft:air', props: {} }];
const index = new Map<string, number>([['minecraft:air', 0]]);
const blocks = new Uint32Array(SX * SY * SZ);

function id(name: string, props: Record<string, string> = {}): number {
  const s = { name: `minecraft:${name}`, props };
  const k = stateKey(s);
  let i = index.get(k);
  if (i === undefined) {
    i = palette.length;
    palette.push(s);
    index.set(k, i);
  }
  return i;
}

function set(x: number, y: number, z: number, name: string, props: Record<string, string> = {}): void {
  if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
  blocks[(y * SZ + z) * SX + x] = id(name, props);
}

function get(x: number, y: number, z: number): number {
  return blocks[(y * SZ + z) * SX + x];
}

// Ground: grass with a gravel path and a small pond.
for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) set(x, 0, z, 'grass_block', { snowy: 'false' });
for (let z = 10; z < SZ; z++) set(6, 0, z, 'dirt_path');
for (const [x, z] of [[1, 10], [2, 10], [1, 11], [2, 11]]) set(x, 0, z, 'water', { level: '0' });
set(3, 0, 11, 'stone_brick_slab', { type: 'bottom', waterlogged: 'true' });

// House footprint: x 2..10, z 2..9 (9 x 8). Foundation.
const X0 = 2, X1 = 10, Z0 = 2, Z1 = 9;
for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) set(x, 1, z, 'stone_bricks');
for (let x = X0; x <= X1; x++) {
  set(x, 1, Z0, 'mossy_stone_bricks');
}

// Walls y 2..4
for (let y = 2; y <= 4; y++) {
  for (let x = X0; x <= X1; x++) {
    for (let z = Z0; z <= Z1; z++) {
      const edgeX = x === X0 || x === X1;
      const edgeZ = z === Z0 || z === Z1;
      if (!edgeX && !edgeZ) continue;
      if (edgeX && edgeZ) set(x, y, z, 'oak_log', { axis: 'y' });
      else set(x, y, z, 'oak_planks');
    }
  }
}
// Windows
for (const x of [4, 8]) {
  set(x, 3, Z0, 'glass_pane', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
  set(x, 3, Z1, 'glass_pane', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
}
for (const z of [4, 7]) {
  set(X0, 3, z, 'glass_pane', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
  set(X1, 3, z, 'glass_pane', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
}
// Door (front side, facing south toward the path)
set(6, 2, Z1, 'oak_door', { facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false' });
set(6, 3, Z1, 'oak_door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false', powered: 'false' });
set(6, 1, Z1 + 1, 'stone_brick_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' });

// Interior
for (let x = X0 + 1; x < X1; x++) for (let z = Z0 + 1; z < Z1; z++) set(x, 1, z, 'spruce_planks');
set(3, 2, 3, 'crafting_table');
set(4, 2, 3, 'furnace', { facing: 'south', lit: 'false' });
set(5, 2, 3, 'chest', { facing: 'south', type: 'single', waterlogged: 'false' });
set(9, 2, 3, 'red_bed', { facing: 'north', part: 'head', occupied: 'false' });
set(9, 2, 4, 'red_bed', { facing: 'north', part: 'foot', occupied: 'false' });
set(3, 2, 8, 'potted_poppy');
set(9, 2, 8, 'bookshelf');
set(9, 3, 8, 'bookshelf');
for (let x = 5; x <= 7; x++) for (let z = 5; z <= 6; z++) set(x, 2, z, 'white_carpet');
set(3, 3, 5, 'wall_torch', { facing: 'east' });
set(9, 3, 6, 'wall_torch', { facing: 'west' });
set(6, 2, 4, 'oak_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' });
set(6, 2, 5, 'oak_fence', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
set(6, 3, 5, 'oak_pressure_plate', { powered: 'false' });

// Roof: stepped oak stairs on the long sides, slabs on top.
for (let x = X0 - 1; x <= X1 + 1; x++) {
  set(x, 5, Z0 - 1, 'spruce_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  set(x, 5, Z1 + 1, 'spruce_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  set(x, 6, Z0 + 1, 'spruce_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  set(x, 6, Z1 - 1, 'spruce_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' });
  for (let z = Z0 + 2; z <= Z1 - 2; z++) set(x, 7, z, 'spruce_slab', { type: 'bottom', waterlogged: 'false' });
  set(x, 7, Z0 + 3, 'spruce_slab', { type: 'double', waterlogged: 'false' });
}
// Fill under roof
for (let x = X0; x <= X1; x++) {
  for (let z = Z0; z <= Z1; z++) {
    if (get(x, 5, z) === 0) set(x, 5, z, 'oak_planks');
  }
  for (let z = Z0 + 2; z <= Z1 - 2; z++) set(x, 6, z, 'oak_planks');
}
// Chimney
for (let y = 2; y <= 8; y++) set(10, y, 6, y === 8 ? 'campfire' : 'bricks', y === 8 ? { facing: 'north', lit: 'true', signal_fire: 'false', waterlogged: 'false' } : {});

// Garden
set(11, 1, 11, 'oak_fence', { east: 'false', west: 'false', north: 'false', south: 'false', waterlogged: 'false' });
set(11, 2, 11, 'lantern', { hanging: 'false', waterlogged: 'false' });
set(0, 1, 0, 'oak_leaves', { distance: '7', persistent: 'true', waterlogged: 'false' });
set(1, 1, 0, 'oak_leaves', { distance: '7', persistent: 'true', waterlogged: 'false' });
set(0, 1, 1, 'oak_leaves', { distance: '7', persistent: 'true', waterlogged: 'false' });
set(0, 2, 0, 'oak_leaves', { distance: '7', persistent: 'true', waterlogged: 'false' });
for (const [x, z, f] of [[8, 11, 'poppy'], [9, 12, 'dandelion'], [4, 12, 'cornflower'], [11, 8, 'oxeye_daisy']] as const) set(x, 1, z, f);
set(12, 1, 3, 'tall_grass', { half: 'lower' });
set(12, 2, 3, 'tall_grass', { half: 'upper' });
set(12, 1, 1, 'short_grass');
for (const [x, z] of [[0, 6], [0, 7], [12, 6]]) set(x, 1, z, 'cobblestone_wall', { east: 'none', west: 'none', north: 'low', south: 'low', up: 'true', waterlogged: 'false' });

// Encode
const bits = litematicaBits(palette.length);
const v3 = (x: number, y: number, z: number) => tag.compound({ x: tag.int(x), y: tag.int(y), z: tag.int(z) });
const paletteTags: Tagged[] = palette.map((s) => {
  const c: Record<string, Tagged> = { Name: tag.string(s.name) };
  const keys = Object.keys(s.props);
  if (keys.length) c.Properties = tag.compound(Object.fromEntries(keys.map((k) => [k, tag.string(s.props[k])])));
  return tag.compound(c);
});
let total = 0;
for (const b of blocks) if (b) total++;
const now = Date.UTC(2026, 10, 18);
const root = tag.compound({
  Version: tag.int(6),
  SubVersion: tag.int(1),
  MinecraftDataVersion: tag.int(3465),
  Metadata: tag.compound({
    Name: tag.string('Example Cottage'),
    Author: tag.string('Webmatica'),
    Description: tag.string('A small cottage used as the bundled example. CC0 / public domain.'),
    RegionCount: tag.int(1),
    TotalBlocks: tag.int(total),
    TotalVolume: tag.int(SX * SY * SZ),
    EnclosingSize: v3(SX, SY, SZ),
    TimeCreated: tag.long(now),
    TimeModified: tag.long(now),
  }),
  Regions: tag.compound({
    Cottage: tag.compound({
      Position: v3(0, 0, 0),
      Size: v3(SX, SY, SZ),
      BlockStatePalette: tag.list(TagType.Compound, paletteTags),
      BlockStates: tag.longArray(pack(blocks, bits)),
      TileEntities: tag.list(TagType.Compound, [
        tag.compound({ x: tag.int(5), y: tag.int(2), z: tag.int(3), id: tag.string('minecraft:chest'), Items: tag.list(TagType.Compound, []) }),
      ]),
      Entities: tag.list(TagType.Compound, []),
      PendingBlockTicks: tag.list(TagType.Compound, []),
      PendingFluidTicks: tag.list(TagType.Compound, []),
    }),
  }),
});

mkdirSync('public/examples', { recursive: true });
const out = 'public/examples/example-cottage.litematic';
writeFileSync(out, gzipSync(writeNbt(root)));
console.log(`Wrote ${out}: ${palette.length} palette entries, ${total} blocks.`);
