import { forEachVarint } from './bits';
import { checkSize, PaletteBuilder, RegionBuilder } from './builder';
import { FLATTENING_DATA_VERSION } from './litematic';
import { getCompound, getList, getNumber, getString, isCompound, type NbtCompound } from './nbt';
import { parseStateKey, SchematicError, type SchematicData, type Vec3 } from './types';

/** Detects Sponge schematics (.schem, versions 1-3). Returns the compound holding the data. */
export function spongeRoot(root: NbtCompound): NbtCompound | null {
  const inner = getCompound(root, 'Schematic');
  const c = inner ?? root;
  if (typeof c.Width === 'number' && typeof c.Height === 'number' && typeof c.Length === 'number') {
    if (isCompound(c.Palette) || isCompound(c.Blocks)) return c;
  }
  return null;
}

export function parseSponge(c: NbtCompound): SchematicData {
  const warnings: string[] = [];
  const version = getNumber(c, 'Version', 1);
  const dataVersion = getNumber(c, 'DataVersion', -1);
  const size: Vec3 = [getNumber(c, 'Width') & 0xffff, getNumber(c, 'Height') & 0xffff, getNumber(c, 'Length') & 0xffff];
  checkSize(size, 'schematic');

  const blocks = getCompound(c, 'Blocks');
  const paletteTag = version >= 3 ? getCompound(blocks ?? {}, 'Palette') : getCompound(c, 'Palette');
  const data = version >= 3 ? blocks?.Data : c.BlockData;
  if (!paletteTag || !(data instanceof Int8Array)) {
    throw new SchematicError('Invalid Sponge schematic: missing block palette or block data.');
  }
  const legacy = dataVersion >= 0 && dataVersion < FLATTENING_DATA_VERSION;
  const palette = new PaletteBuilder(legacy);
  let maxIndex = 0;
  for (const v of Object.values(paletteTag)) if (typeof v === 'number') maxIndex = Math.max(maxIndex, v);
  const remap = new Uint32Array(maxIndex + 1);
  for (const [key, v] of Object.entries(paletteTag)) {
    if (typeof v === 'number' && v >= 0) remap[v] = palette.add(parseStateKey(key));
  }

  const counts = new Uint32Array(palette.states.length);
  const tileEntities = version >= 3 ? getList(blocks, 'BlockEntities').length : getList(c, 'BlockEntities').length || getList(c, 'TileEntities').length;
  const rb = new RegionBuilder('Main', [0, 0, 0], size, palette.bytesPerBlock, counts, tileEntities);
  const [sx, , sz] = size;
  const layer = sx * sz;
  const total = size[0] * size[1] * size[2];
  let bad = 0;
  const read = forEachVarint(data, total, (i, v) => {
    if (v >= remap.length) {
      bad++;
      return;
    }
    const id = remap[v];
    if (id === 0) return;
    const y = Math.floor(i / layer);
    const rem = i - y * layer;
    const z = Math.floor(rem / sx);
    rb.setFresh(rem - z * sx, y, z, id);
  });
  if (read < total) warnings.push('Block data is truncated; missing blocks are shown as air.');
  if (bad) warnings.push(`${bad.toLocaleString('en-US')} blocks reference missing palette entries and are shown as air.`);

  const meta = getCompound(c, 'Metadata');
  return {
    format: 'sponge',
    meta: {
      name: getString(meta, 'Name'),
      author: getString(meta, 'Author'),
      description: getString(meta, 'Description'),
      formatVersion: version,
      dataVersion,
      timeCreated: getNumber(meta, 'Date', 0) || undefined,
      convertedFromLegacy: legacy,
    },
    size,
    palette: palette.states,
    regions: [rb.build()],
    totalCounts: counts,
    warnings,
  };
}
