/**
 * Chests are drawn by the game from an "entity" texture (textures/entity/chest/*.png,
 * a 64x64 unwrap of the lid, base and latch), not from block textures. This module
 * builds regular block-face tiles for a closed single chest from that unwrap so the
 * chunk renderer can texture chests like any other block.
 *
 * Unwrap layout (in 64x64 pixels): lid box at (0,0) size 14x5x14, base box at
 * (0,19) size 14x10x14, latch box at (0,0) size 2x4x1. For a box at (u,v) with
 * size (w,h,d): bottom region at (u+d, v) and top region at (u+d+w, v), side strip at
 * v+d: west (u), north (u+d), east (u+d+w), south/front (u+2d+w).
 *
 * Output tiles match the built-in chest model: a box from (1,0,1) to (15,14,15),
 * so side faces occupy columns 1..15 and rows 2..16 of the 16x16 tile, and the
 * top/bottom occupy columns and rows 1..15.
 */

export interface RgbaImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export const CHEST_VARIANTS = ['normal', 'trapped', 'ender'] as const;
export const CHEST_FACES = ['top', 'bottom', 'front', 'back', 'left', 'right'] as const;
export type ChestFace = (typeof CHEST_FACES)[number];

export function chestTextureName(variant: string, face: ChestFace): string {
  return `chest_${variant}_${face}`;
}

/** Source pixel (in 64x64 unwrap units) for a face-local position (0..14). Returns null outside the face. */
function sourceFor(face: ChestFace, fx: number, fy: number): [number, number] | null {
  if (fx < 0 || fy < 0 || fx >= 14 || fy >= 14) return null;
  const sideX: Record<string, number> = { front: 42, back: 14, left: 0, right: 28 };
  switch (face) {
    case 'top':
      // The visible top is the lid's "up" region (u+d+w = 28..42, not 14..28, which is
      // the inside of the lid). Row 0 is the front edge, and columns run from the
      // model's +X side because the model faces +Z: mirror horizontally.
      return [28 + (13 - fx), fy];
    case 'bottom':
      return [14 + fx, 19 + fy];
    default: {
      // Entity models are modelled upside down (y points down), so every side strip
      // is read bottom-up. Latch on the front face: columns 6..8, rows 3..7.
      if (face === 'front' && fx >= 6 && fx < 8 && fy >= 3 && fy < 7) return [4 + (fx - 6), 1 + (6 - fy)];
      const x = sideX[face] + fx;
      // Lid side (5 rows, v 14..18) above the base side (v 33..42; its top row is hidden by the lid).
      return fy < 5 ? [x, 18 - fy] : [x, 46 - fy];
    }
  }
}

/** Builds the six face tiles (RGBA, size x size) from a chest entity texture. */
export function composeChestFaces(src: RgbaImage, size: number): Record<ChestFace, Uint8Array> {
  const f = src.width / 64; // unwrap scale (64 px textures -> 1, 128 px -> 2...)
  const out = {} as Record<ChestFace, Uint8Array>;
  for (const face of CHEST_FACES) {
    const tile = new Uint8Array(size * size * 4);
    const vertical = face === 'top' || face === 'bottom';
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Position in 16x16 block pixels, then face-local position.
        const mx = ((px + 0.5) * 16) / size;
        const my = ((py + 0.5) * 16) / size;
        const fx = Math.floor(mx - 1);
        const fy = Math.floor(my - (vertical ? 1 : 2));
        const s = sourceFor(face, fx, fy);
        if (!s) continue;
        // Sub-pixel position inside the source pixel for high-resolution packs.
        const sx = Math.min(src.width - 1, Math.floor((s[0] + (mx - 1 - fx)) * f));
        const sy = Math.min(src.height - 1, Math.floor((s[1] + (my - (vertical ? 1 : 2) - fy)) * f));
        const si = (sy * src.width + sx) * 4;
        const di = (py * size + px) * 4;
        tile[di] = src.data[si];
        tile[di + 1] = src.data[si + 1];
        tile[di + 2] = src.data[si + 2];
        tile[di + 3] = src.data[si + 3];
      }
    }
    out[face] = tile;
  }
  return out;
}
