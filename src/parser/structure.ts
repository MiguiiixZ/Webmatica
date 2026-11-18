import { checkSize, PaletteBuilder, RegionBuilder } from './builder';
import { FLATTENING_DATA_VERSION } from './litematic';
import { looksLegacy } from './legacy';
import { getCompound, getList, getNumber, getString, isCompound, type NbtCompound, type NbtValue } from './nbt';
import { SchematicError, type BlockState, type SchematicData, type Vec3 } from './types';

/** Detects vanilla structure block files (.nbt). */
export function isStructure(root: NbtCompound): boolean {
  return Array.isArray(root.size) && Array.isArray(root.blocks) && (Array.isArray(root.palette) || Array.isArray(root.palettes));
}

function entry(v: NbtValue): BlockState {
  if (!isCompound(v)) return { name: 'minecraft:air', props: {} };
  const props: Record<string, string> = {};
  const p = getCompound(v, 'Properties');
  if (p) for (const [k, val] of Object.entries(p)) props[k] = String(val);
  return { name: getString(v, 'Name', 'minecraft:air'), props };
}

function intList(v: NbtValue | undefined): number[] {
  if (Array.isArray(v)) return v.map((n) => (typeof n === 'number' ? n : 0));
  if (v instanceof Int32Array) return Array.from(v);
  return [];
}

export function parseStructure(root: NbtCompound): SchematicData {
  const warnings: string[] = [];
  const dataVersion = getNumber(root, 'DataVersion', -1);
  const s = intList(root.size);
  if (s.length !== 3) throw new SchematicError('Invalid structure file: bad size.');
  const size: Vec3 = [s[0], s[1], s[2]];
  checkSize(size, 'structure');

  let rawPalette = getList(root, 'palette');
  if (rawPalette.length === 0) {
    const palettes = getList(root, 'palettes');
    if (palettes.length > 1) warnings.push(`This structure has ${palettes.length} palette variants; showing the first one.`);
    rawPalette = Array.isArray(palettes[0]) ? palettes[0] : [];
  }
  const states = rawPalette.map(entry);
  const legacy =
    (dataVersion >= 0 && dataVersion < FLATTENING_DATA_VERSION) || (dataVersion < 0 && looksLegacy(states.map((x) => x.name)));
  const palette = new PaletteBuilder(legacy);
  const remap = states.map((st) => palette.add(st));
  const counts = new Uint32Array(palette.states.length);
  const blocks = getList(root, 'blocks');
  let tileEntities = 0;
  const rb = new RegionBuilder('Main', [0, 0, 0], size, palette.bytesPerBlock, counts);
  let bad = 0;
  for (const b of blocks) {
    if (!isCompound(b)) continue;
    const pos = intList(b.pos);
    const st = getNumber(b, 'state', -1);
    if (pos.length !== 3 || st < 0 || st >= remap.length) {
      bad++;
      continue;
    }
    const [x, y, z] = pos;
    if (x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) {
      bad++;
      continue;
    }
    if (isCompound(b.nbt)) tileEntities++;
    rb.set(x, y, z, remap[st]);
  }
  rb.tileEntityCount = tileEntities;
  if (bad) warnings.push(`${bad} invalid block entries were skipped.`);

  return {
    format: 'structure',
    meta: {
      name: '',
      author: getString(root, 'author'),
      description: '',
      formatVersion: 1,
      dataVersion,
      convertedFromLegacy: legacy,
    },
    size,
    palette: palette.states,
    regions: [rb.build()],
    totalCounts: counts,
    warnings,
  };
}
