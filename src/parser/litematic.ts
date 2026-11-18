import { litematicaBits, packedWordCount } from './bits';
import { checkSize, PaletteBuilder, RegionBuilder } from './builder';
import { looksLegacy } from './legacy';
import {
  getCompound,
  getList,
  getNumber,
  getString,
  isCompound,
  NbtLongArray,
  type NbtCompound,
  type NbtValue,
} from './nbt';
import { SchematicError, type BlockState, type SchematicData, type Vec3 } from './types';

/** First Minecraft data version using flattened (1.13+) block ids. */
export const FLATTENING_DATA_VERSION = 1451;
/** Highest litematic format version we know about. Newer files are attempted with a warning. */
export const MAX_KNOWN_LITEMATIC_VERSION = 7;

export function isLitematic(root: NbtCompound): boolean {
  return isCompound(root.Regions) && (typeof root.Version === 'number' || isCompound(root.Metadata));
}

function vec(c: NbtCompound | undefined): Vec3 {
  return [getNumber(c, 'x'), getNumber(c, 'y'), getNumber(c, 'z')];
}

function readPaletteEntry(v: NbtValue): BlockState {
  if (!isCompound(v)) return { name: 'minecraft:air', props: {} };
  const props: Record<string, string> = {};
  const p = getCompound(v, 'Properties');
  if (p) for (const [k, val] of Object.entries(p)) props[k] = String(val);
  return { name: getString(v, 'Name', 'minecraft:air'), props };
}

interface RawRegion {
  name: string;
  min: Vec3;
  size: Vec3;
  palette: BlockState[];
  states: NbtLongArray | undefined;
  tileEntities: number;
  dataVersion: number;
}

/**
 * Normalizes a region's position/size pair. Litematica allows negative sizes,
 * meaning the region extends from `pos` towards negative coordinates; block
 * data is always stored relative to the minimum corner.
 */
export function normalizeRegion(pos: Vec3, size: Vec3): { min: Vec3; size: Vec3 } {
  const min: Vec3 = [0, 0, 0];
  const abs: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const s = size[i];
    abs[i] = Math.abs(s);
    min[i] = s < 0 ? pos[i] + s + 1 : pos[i];
  }
  return { min, size: abs };
}

export function parseLitematic(root: NbtCompound): SchematicData {
  const warnings: string[] = [];
  const version = getNumber(root, 'Version', 0);
  if (version <= 0) throw new SchematicError('Unsupported litematic file: missing or invalid format version.');
  if (version > MAX_KNOWN_LITEMATIC_VERSION) {
    warnings.push(`Litematic format version ${version} is newer than the versions this viewer was tested with (up to ${MAX_KNOWN_LITEMATIC_VERSION}). It may not display correctly.`);
  }
  const dataVersion = getNumber(root, 'MinecraftDataVersion', -1);
  const meta = getCompound(root, 'Metadata') ?? {};
  const regionsTag = getCompound(root, 'Regions');
  if (!regionsTag) throw new SchematicError('Invalid litematic file: no regions found.');

  // Pass 1: read region headers and palettes.
  const raws: RawRegion[] = [];
  for (const [name, value] of Object.entries(regionsTag)) {
    if (!isCompound(value)) continue;
    const { min, size } = normalizeRegion(vec(getCompound(value, 'Position')), vec(getCompound(value, 'Size')));
    checkSize(size, `region "${name}"`);
    const statesTag = value.BlockStates;
    raws.push({
      name,
      min,
      size,
      palette: getList(value, 'BlockStatePalette').map(readPaletteEntry),
      states: statesTag instanceof NbtLongArray ? statesTag : undefined,
      tileEntities: getList(value, 'TileEntities').length,
      dataVersion: getNumber(value, 'DataVersion', dataVersion),
    });
  }
  if (raws.length === 0) throw new SchematicError('Invalid litematic file: the schematic has no regions.');

  // Legacy (1.12) detection: explicit data version, or legacy-only block names when unknown.
  const allNames = raws.flatMap((r) => r.palette.map((p) => p.name));
  const legacy =
    (dataVersion >= 0 && dataVersion < FLATTENING_DATA_VERSION) || (dataVersion < 0 && looksLegacy(allNames));

  // Pass 2: merge palettes.
  const palette = new PaletteBuilder(legacy);
  const remaps = raws.map((r) => {
    const map = new Uint32Array(r.palette.length);
    r.palette.forEach((s, i) => (map[i] = palette.add(s)));
    return map;
  });

  // Enclosing box.
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const r of raws) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], r.min[i]);
      hi[i] = Math.max(hi[i], r.min[i] + r.size[i]);
    }
  }
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];

  // Pass 3: decode block data.
  const counts = new Uint32Array(palette.states.length);
  const bpb = palette.bytesPerBlock;
  const regions = raws.map((r, ri) => {
    const offset: Vec3 = [r.min[0] - lo[0], r.min[1] - lo[1], r.min[2] - lo[2]];
    const rb = new RegionBuilder(r.name, offset, r.size, bpb, counts, r.tileEntities);
    const volume = r.size[0] * r.size[1] * r.size[2];
    if (volume > 0) {
      if (!r.states) {
        warnings.push(`Region "${r.name}" has no block data.`);
      } else if (r.palette.length === 0) {
        warnings.push(`Region "${r.name}" has an empty block palette.`);
      } else {
        decodeRegion(r, rb, remaps[ri], warnings);
      }
    }
    return rb.build();
  });

  return {
    format: 'litematic',
    meta: {
      name: getString(meta, 'Name'),
      author: getString(meta, 'Author'),
      description: getString(meta, 'Description'),
      formatVersion: version,
      dataVersion,
      timeCreated: getNumber(meta, 'TimeCreated', 0) || undefined,
      timeModified: getNumber(meta, 'TimeModified', 0) || undefined,
      declaredTotalBlocks: getNumber(meta, 'TotalBlocks', -1) >= 0 ? getNumber(meta, 'TotalBlocks') : undefined,
      declaredTotalVolume: getNumber(meta, 'TotalVolume', -1) >= 0 ? getNumber(meta, 'TotalVolume') : undefined,
      convertedFromLegacy: legacy,
    },
    size,
    palette: palette.states,
    regions,
    totalCounts: counts,
    warnings,
  };
}

function decodeRegion(r: RawRegion, rb: RegionBuilder, remap: Uint32Array, warnings: string[]): void {
  const [sx, sy, sz] = r.size;
  const count = sx * sy * sz;
  const words = r.states!.words;
  let bits = litematicaBits(r.palette.length);
  if (words.length < packedWordCount(count, bits)) {
    // Some writers size the array differently; derive bits from the array length as a fallback.
    const derived = Math.floor((words.length * 32) / count);
    if (derived >= 1 && derived < bits) {
      warnings.push(`Region "${r.name}": block data is shorter than expected; decoding with ${derived} bits per block.`);
      bits = derived;
    } else {
      warnings.push(`Region "${r.name}": block data is truncated; missing blocks are shown as air.`);
    }
  }
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  const paletteLen = remap.length;
  const last = words.length - 1;
  let wi = 0;
  let off = 0;
  let outOfRange = 0;
  outer: for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (wi > last) break outer;
        let v = words[wi] >>> off;
        const end = off + bits;
        if (end > 32 && wi < last) v |= words[wi + 1] << (32 - off);
        v = (v & mask) >>> 0;
        off = end;
        if (off >= 32) {
          off -= 32;
          wi++;
        }
        if (v === 0 && remap[0] === 0) continue;
        if (v >= paletteLen) {
          outOfRange++;
          continue;
        }
        const id = remap[v];
        if (id !== 0) rb.setFresh(x, y, z, id);
      }
    }
  }
  if (outOfRange > 0) {
    warnings.push(`Region "${r.name}": ${outOfRange.toLocaleString('en-US')} blocks reference missing palette entries and are shown as air.`);
  }
}
