import { checkSize, PaletteBuilder, RegionBuilder } from './builder';
import { legacyFromNumeric } from './legacy';
import { getList, getNumber, type NbtCompound } from './nbt';
import { SchematicError, type SchematicData, type Vec3 } from './types';

/** Detects MCEdit / WorldEdit legacy schematics (.schematic, Minecraft 1.12 and older). */
export function isMcedit(root: NbtCompound): boolean {
  return root.Blocks instanceof Int8Array && root.Data instanceof Int8Array && typeof root.Width === 'number';
}

export function parseMcedit(root: NbtCompound): SchematicData {
  const warnings: string[] = [];
  const size: Vec3 = [getNumber(root, 'Width') & 0xffff, getNumber(root, 'Height') & 0xffff, getNumber(root, 'Length') & 0xffff];
  checkSize(size, 'schematic');
  const blocks = root.Blocks as Int8Array;
  const data = root.Data as Int8Array;
  const add = root.AddBlocks instanceof Int8Array ? root.AddBlocks : null;
  const total = size[0] * size[1] * size[2];
  if (blocks.length < total || data.length < total) {
    throw new SchematicError('Invalid .schematic file: block data is shorter than the declared size.');
  }

  const idAt = (i: number): number => {
    let id = blocks[i] & 0xff;
    if (add) {
      const nib = add[i >> 1];
      id |= (i & 1) === 0 ? (nib & 0x0f) << 8 : (nib & 0xf0) << 4;
    }
    return id;
  };

  // Pass 1: map each distinct (id, data) pair to a palette id.
  const palette = new PaletteBuilder(true);
  const combo = new Map<number, number>();
  const unknown = new Set<number>();
  for (let i = 0; i < total; i++) {
    const id = idAt(i);
    if (id === 0) continue;
    const key = (id << 4) | (data[i] & 15);
    if (combo.has(key)) continue;
    const st = legacyFromNumeric(id, data[i] & 15);
    if (!st) {
      unknown.add(id);
      combo.set(key, 0);
    } else combo.set(key, palette.add(st));
  }
  if (unknown.size) warnings.push(`Unknown block ids shown as air: ${[...unknown].slice(0, 20).join(', ')}.`);

  // Pass 2: fill the volume.
  const counts = new Uint32Array(palette.states.length);
  const rb = new RegionBuilder('Main', [0, 0, 0], size, palette.bytesPerBlock, counts, getList(root, 'TileEntities').length);
  const [sx, sy, sz] = size;
  let i = 0;
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++, i++) {
        const id = idAt(i);
        if (id === 0) continue;
        const pid = combo.get((id << 4) | (data[i] & 15)) ?? 0;
        if (pid) rb.setFresh(x, y, z, pid);
      }
    }
  }

  return {
    format: 'mcedit',
    meta: {
      name: '',
      author: '',
      description: '',
      formatVersion: 0,
      dataVersion: -1,
      convertedFromLegacy: true,
    },
    size,
    palette: palette.states,
    regions: [rb.build()],
    totalCounts: counts,
    warnings,
  };
}
