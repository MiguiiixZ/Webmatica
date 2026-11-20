import { describe, expect, it } from 'vitest';
import { composeChestFaces } from '../src/render/chestTextures';

/** A 64x64 image whose pixel (x, y) stores x in red and y in green. */
function coordImage() {
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) data.set([x, y, 0, 255], (y * 64 + x) * 4);
  return { width: 64, height: 64, data };
}
const at = (tile: Uint8Array, x: number, y: number) => [tile[(y * 16 + x) * 4], tile[(y * 16 + x) * 4 + 1]];

describe('chest entity texture to block faces', () => {
  const f = composeChestFaces(coordImage(), 16);

  it('takes the top from the outside of the lid and the bottom from the base', () => {
    expect(at(f.top, 1, 1)).toEqual([41, 0]); // lid top region, mirrored
    expect(at(f.top, 14, 1)).toEqual([28, 0]);
    expect(at(f.bottom, 1, 1)).toEqual([14, 19]);
  });

  it('stacks the lid side above the base side, read bottom-up', () => {
    // Side faces start at row 2 of the tile (the chest is 14 px tall).
    expect(at(f.back, 1, 2)).toEqual([14, 18]); // top row of the lid side
    expect(at(f.back, 1, 6)).toEqual([14, 14]); // bottom row of the lid side
    expect(at(f.back, 1, 7)).toEqual([14, 41]); // first visible row of the base side
    expect(at(f.back, 1, 15)).toEqual([14, 33]); // bottom of the base
    expect(at(f.left, 1, 2)[0]).toBe(0);
    expect(at(f.right, 1, 2)[0]).toBe(28);
  });

  it('draws the latch on the front face across the seam', () => {
    expect(at(f.front, 7, 5)).toEqual([4, 4]);
    expect(at(f.front, 8, 8)).toEqual([5, 1]);
    expect(at(f.front, 1, 2)).toEqual([42, 18]);
  });

  it('leaves the area outside the chest transparent', () => {
    expect(f.front[(0 * 16 + 0) * 4 + 3]).toBe(0);
  });
});
