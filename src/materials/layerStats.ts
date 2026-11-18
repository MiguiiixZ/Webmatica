import type { Schematic } from '../parser/types';
import { CHUNK, CHUNK_VOLUME } from '../parser/volume';

/**
 * Iterates over every non-air block of the given regions, calling fn with
 * schematic coordinates and palette id. Walks stored chunks only.
 */
export function forEachBlock(
  schematic: Schematic,
  regions: boolean[] | null,
  fn: (x: number, y: number, z: number, id: number, region: number) => void,
): void {
  schematic.regions.forEach((r, ri) => {
    if (regions && !regions[ri]) return;
    const v = r.volume;
    const [ox, oy, oz] = r.offset;
    for (let cy = 0; cy < v.cy; cy++)
      for (let cz = 0; cz < v.cz; cz++)
        for (let cx = 0; cx < v.cx; cx++) {
          const slot = v.slots[v.chunkIndex(cx, cy, cz)];
          if (slot < 0) continue;
          const base = slot * CHUNK_VOLUME;
          const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;
          const x1 = Math.min(CHUNK, v.sx - x0), y1 = Math.min(CHUNK, v.sy - y0), z1 = Math.min(CHUNK, v.sz - z0);
          for (let ly = 0; ly < y1; ly++)
            for (let lz = 0; lz < z1; lz++) {
              let i = base + (ly << 8) + (lz << 4);
              for (let lx = 0; lx < x1; lx++, i++) {
                const id = v.data[i];
                if (id !== 0) fn(ox + x0 + lx, oy + y0 + ly, oz + z0 + lz, id, ri);
              }
            }
        }
  });
}

/** Number of non-air blocks in each layer along an axis. */
export function layerCounts(schematic: Schematic, axis: 0 | 1 | 2, regions: boolean[] | null): Uint32Array {
  const out = new Uint32Array(schematic.size[axis]);
  forEachBlock(schematic, regions, (x, y, z) => {
    out[axis === 0 ? x : axis === 1 ? y : z]++;
  });
  return out;
}

/**
 * Per-layer, per-palette counts along an axis: counts[layer * paletteSize + id].
 * Used to compute material lists for any layer range quickly.
 */
export function layerPaletteCounts(schematic: Schematic, axis: 0 | 1 | 2, regions: boolean[] | null): Uint32Array {
  const P = schematic.palette.length;
  const out = new Uint32Array(schematic.size[axis] * P);
  forEachBlock(schematic, regions, (x, y, z, id) => {
    out[(axis === 0 ? x : axis === 1 ? y : z) * P + id]++;
  });
  return out;
}
