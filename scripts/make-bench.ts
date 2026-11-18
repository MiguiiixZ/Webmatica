/**
 * Generates large procedural .litematic files for performance testing.
 * They are not part of the repository (written to the given directory).
 *
 * Usage: npx tsx scripts/make-bench.ts <outDir> [sizeX sizeY sizeZ] [name]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { litematicaBits } from '../src/parser/bits';
import { tag, TagType, writeNbt, type Tagged } from '../src/parser/nbt';

const out = process.argv[2] ?? '.';
const SX = Number(process.argv[3] ?? 100);
const SY = Number(process.argv[4] ?? 100);
const SZ = Number(process.argv[5] ?? 100);
const name = process.argv[6] ?? `bench-${SX}x${SY}x${SZ}`;

const palette: { Name: string; Properties?: Record<string, string> }[] = [{ Name: 'minecraft:air' }];
const ids = new Map<string, number>();
function id(n: string, props?: Record<string, string>): number {
  const key = n + JSON.stringify(props ?? {});
  let i = ids.get(key);
  if (i === undefined) {
    i = palette.length;
    palette.push({ Name: `minecraft:${n}`, Properties: props });
    ids.set(key, i);
  }
  return i;
}

const vol = new Uint16Array(SX * SY * SZ);
const set = (x: number, y: number, z: number, v: number) => {
  if (x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ) vol[(y * SZ + z) * SX + x] = v;
};

let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const GROUND = [id('stone'), id('dirt'), id('grass_block', { snowy: 'false' })];
const WALLS = ['stone_bricks', 'bricks', 'oak_planks', 'spruce_planks', 'white_concrete', 'gray_concrete', 'sandstone', 'deepslate_bricks'];
const ROOF = ['oak', 'spruce', 'dark_oak', 'stone_brick', 'brick'];

// Terrain: 4 layers.
const groundH = Math.min(4, SY);
for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) for (let y = 0; y < groundH; y++) set(x, y, z, GROUND[Math.min(2, Math.floor((y / groundH) * 3))]);

// Buildings on a grid of plots.
const plot = 24;
for (let px = 2; px + 16 < SX; px += plot) {
  for (let pz = 2; pz + 16 < SZ; pz += plot) {
    const w = 10 + Math.floor(rnd() * 8);
    const d = 10 + Math.floor(rnd() * 8);
    const floors = 1 + Math.floor(rnd() * Math.max(1, (SY - groundH - 8) / 5));
    const h = Math.min(SY - groundH - 3, floors * 5);
    const wall = id(WALLS[Math.floor(rnd() * WALLS.length)]);
    const glass = id('glass_pane', { north: 'true', south: 'true', east: 'true', west: 'true', waterlogged: 'false' });
    const floor = id('spruce_planks');
    const log = id('oak_log', { axis: 'y' });
    for (let y = groundH; y < groundH + h; y++) {
      const level = (y - groundH) % 5;
      for (let x = px; x < px + w; x++) {
        for (let z = pz; z < pz + d; z++) {
          const edge = x === px || x === px + w - 1 || z === pz || z === pz + d - 1;
          const corner = (x === px || x === px + w - 1) && (z === pz || z === pz + d - 1);
          if (level === 0) set(x, y, z, edge ? wall : floor);
          else if (corner) set(x, y, z, log);
          else if (edge) set(x, y, z, level === 2 && (x + z) % 3 === 0 ? glass : wall);
        }
      }
    }
    // Stair roof
    const r = ROOF[Math.floor(rnd() * ROOF.length)];
    const top = groundH + h;
    for (let i = 0; i < Math.ceil(d / 2) && top + i < SY; i++) {
      for (let x = px - 1; x <= px + w; x++) {
        set(x, top + i, pz + i, id(`${r}_stairs`, { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' }));
        set(x, top + i, pz + d - 1 - i, id(`${r}_stairs`, { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' }));
        for (let z = pz + i + 1; z < pz + d - 1 - i; z++) set(x, top + i, z, id(`${r === 'stone_brick' || r === 'brick' ? r + 's' : r + '_planks'}`.replace('bricks_planks', 'bricks')));
      }
    }
    // Garden: trees and flowers
    const tx = px + w + 2;
    const tz = pz + 2;
    for (let y = groundH; y < groundH + 5; y++) set(tx, y, tz, log);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = 3; dy <= 6; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 4) < 5 && (dx || dz || dy > 4)) set(tx + dx, groundH + dy, tz + dz, id('oak_leaves', { distance: '1', persistent: 'true', waterlogged: 'false' }));
    for (let k = 0; k < 6; k++) set(px + Math.floor(rnd() * w), groundH, pz + d + 1 + Math.floor(rnd() * 3), id(['poppy', 'dandelion', 'short_grass', 'cornflower'][k % 4]));
    set(px + 2, groundH + 1, pz + 1, id('wall_torch', { facing: 'north' }));
  }
}

// Pack
const bits = litematicaBits(palette.length);
const count = vol.length;
const words = new Uint32Array(Math.ceil((count * bits) / 64) * 2);
let wi = 0;
let off = 0;
for (let i = 0; i < count; i++) {
  const v = vol[i];
  words[wi] |= v << off;
  if (off + bits > 32) words[wi + 1] |= v >>> (32 - off);
  off += bits;
  if (off >= 32) {
    off -= 32;
    wi++;
  }
}
let total = 0;
for (let i = 0; i < count; i++) if (vol[i]) total++;
const v3 = (x: number, y: number, z: number) => tag.compound({ x: tag.int(x), y: tag.int(y), z: tag.int(z) });
const pal: Tagged[] = palette.map((p) => {
  const c: Record<string, Tagged> = { Name: tag.string(p.Name) };
  if (p.Properties) c.Properties = tag.compound(Object.fromEntries(Object.entries(p.Properties).map(([k, v]) => [k, tag.string(v)])));
  return tag.compound(c);
});
const root = tag.compound({
  Version: tag.int(6),
  MinecraftDataVersion: tag.int(3465),
  Metadata: tag.compound({ Name: tag.string(name), Author: tag.string('bench'), TotalBlocks: tag.int(total), TotalVolume: tag.int(count), EnclosingSize: v3(SX, SY, SZ) }),
  Regions: tag.compound({
    Main: tag.compound({
      Position: v3(0, 0, 0),
      Size: v3(SX, SY, SZ),
      BlockStatePalette: tag.list(TagType.Compound, pal),
      BlockStates: tag.longArray(words),
      TileEntities: tag.list(TagType.Compound, []),
    }),
  }),
});
const file = join(out, `${name}.litematic`);
const gz = gzipSync(writeNbt(root));
writeFileSync(file, gz);
console.log(`${file}: ${(gz.length / 1024).toFixed(0)} KB, ${palette.length} states, ${total.toLocaleString()} blocks`);
