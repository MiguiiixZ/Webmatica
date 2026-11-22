import { describe, expect, it } from 'vitest';
import { compileTables } from '../src/render/blockTables';
import { builtinModel } from '../src/render/models';
import { Mesher, nonEmptyChunks } from '../src/render/mesher';
import { VolumeBuilder } from '../src/parser/volume';
import type { BlockState } from '../src/parser/types';
import { S } from './helpers';

function build(size: [number, number, number], palette: BlockState[], fill: (x: number, y: number, z: number) => number) {
  const vb = new VolumeBuilder(size[0], size[1], size[2], 1);
  for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) for (let x = 0; x < size[0]; x++) vb.set(x, y, z, fill(x, y, z));
  const volume = vb.build();
  const { tables } = compileTables(palette, builtinModel, null);
  const mesher = new Mesher([{ offset: [0, 0, 0], volume }], tables);
  mesher.ao = false;
  return { mesher, volume };
}

const quads = (a: Uint32Array) => a.length / 12;

/** Decodes vertices of a mesh into positions (in blocks) and normals. */
function vertices(a: Uint32Array) {
  const out: { p: [number, number, number]; n: number }[] = [];
  for (let i = 0; i < a.length; i += 3) {
    const w0 = a[i];
    const w2 = a[i + 2];
    const c = (lo: number, bit: number) => (lo | (((w2 >> bit) & 1) << 10)) / 32;
    out.push({ p: [c(w0 & 1023, 16), c((w0 >> 10) & 1023, 17), c((w0 >> 20) & 1023, 18)], n: a[i + 1] & 7 });
  }
  return out;
}

describe('mesher', () => {
  const palette = [S('air'), S('stone'), S('glass'), S('oak_slab', { type: 'bottom' })];

  it('emits 6 faces for a single cube', () => {
    const { mesher } = build([1, 1, 1], palette, () => 1);
    const out = mesher.mesh(0, 0, 0, [true], null);
    expect(quads(out.solid)).toBe(6);
    expect(quads(out.translucent)).toBe(0);
  });

  it('culls faces between adjacent solid cubes and merges coplanar faces', () => {
    const { mesher } = build([16, 1, 16], palette, () => 1);
    const out = mesher.mesh(0, 0, 0, [true], null);
    // A 16x1x16 slab of stone: top, bottom and 4 sides, each merged into one quad.
    expect(quads(out.solid)).toBe(6);
  });

  it('does not merge different blocks', () => {
    const { mesher } = build([2, 1, 1], [S('air'), S('stone'), S('dirt')], (x) => (x === 0 ? 1 : 2));
    const out = mesher.mesh(0, 0, 0, [true], null);
    expect(quads(out.solid)).toBe(10);
  });

  it('hides faces between glass blocks but keeps faces towards solid blocks visible', () => {
    const { mesher } = build([3, 1, 1], palette, (x) => (x < 2 ? 2 : 1));
    const out = mesher.mesh(0, 0, 0, [true], null);
    // Two glass cubes: 10 outer faces, merged into 6 quads (the shared face is hidden,
    // the glass face touching stone is hidden by the opaque stone).
    expect(quads(out.translucent)).toBe(5);
    // Stone: 5 faces visible, the one touching glass too (glass does not occlude).
    expect(quads(out.solid)).toBe(6);
  });

  it('meshes non-cubic blocks from their model and culls their bottom face on solid ground', () => {
    const { mesher } = build([1, 2, 1], palette, (_x, y) => (y === 0 ? 1 : 3));
    const out = mesher.mesh(0, 0, 0, [true], null);
    // Stone: 5 visible (top hidden? no - slab does not occlude) => 6. Slab: 5 faces (bottom culled by stone).
    expect(quads(out.solid)).toBe(6 + 5);
    const top = vertices(out.solid).filter((v) => v.n === 1).map((v) => v.p[1]);
    expect(Math.max(...top)).toBe(1.5);
  });

  it('applies the layer clip and exposes cut faces', () => {
    const { mesher } = build([1, 3, 1], palette, () => 1);
    const full = mesher.mesh(0, 0, 0, [true], null);
    expect(quads(full.solid)).toBe(6);
    const clipped = mesher.mesh(0, 0, 0, [true], { axis: 1, min: 1, max: 1 });
    expect(quads(clipped.solid)).toBe(6);
    const ys = vertices(clipped.solid).map((v) => v.p[1]);
    expect(Math.min(...ys)).toBe(1);
    expect(Math.max(...ys)).toBe(2);
  });

  it('respects region visibility', () => {
    const { mesher } = build([1, 1, 1], palette, () => 1);
    expect(quads(mesher.mesh(0, 0, 0, [false], null).solid)).toBe(0);
  });

  it('culls faces across mesh unit borders', () => {
    const { mesher } = build([64, 1, 1], palette, () => 1);
    const a = mesher.mesh(0, 0, 0, [true], null);
    const b = mesher.mesh(1, 0, 0, [true], null);
    // Each half: 4 long sides + one end cap; the faces at x = 32 are hidden.
    expect(quads(a.solid)).toBe(5);
    expect(quads(b.solid)).toBe(5);
  });

  it('lists non-empty chunks', () => {
    const { volume } = build([80, 1, 1], palette, (x) => (x === 79 ? 1 : 0));
    const ne = nonEmptyChunks([{ offset: [0, 0, 0], volume }], [80, 1, 1]);
    expect(Array.from(ne)).toEqual([0, 0, 1]);
  });

  it('computes ambient occlusion without breaking face counts', () => {
    const { mesher } = build([3, 2, 3], palette, (x, y, z) => (y === 0 || (x === 1 && z === 1) ? 1 : 0));
    mesher.ao = true;
    const out = mesher.mesh(0, 0, 0, [true], null);
    const aos = new Set<number>();
    for (let i = 0; i < out.solid.length; i += 3) aos.add(out.solid[i] >>> 30);
    expect(aos.has(3)).toBe(true);
    expect([...aos].some((a) => a < 3)).toBe(true);
  });

  describe('liquids', () => {
    const lavaPal = [S('air'), S('lava', { level: '0' }), S('lava', { level: '2' }), S('stone'), S('water', { level: '0' })];

    it('slopes the surface of flowing liquid towards lower levels, like the game', () => {
      // Source at x=0, level 2 at x=1, nothing at x=2.
      const { mesher } = build([3, 1, 1], lavaPal, (x) => (x === 0 ? 1 : x === 1 ? 2 : 0));
      const out = mesher.mesh(0, 0, 0, [true], null);
      const v = vertices(out.solid);
      // First top quad of the flowing block: the quad whose x range is [1, 2] with normal up.
      const tops: { p: [number, number, number]; n: number }[][] = [];
      for (let i = 0; i < v.length; i += 4) if (v[i].n === 1) tops.push(v.slice(i, i + 4));
      const flowing = tops.find((q) => Math.min(...q.map((c) => c.p[0])) === 1 && Math.max(...q.map((c) => c.p[0])) === 2)!;
      const west = flowing.filter((c) => c.p[0] === 1).map((c) => c.p[1]);
      const east = flowing.filter((c) => c.p[0] === 2).map((c) => c.p[1]);
      // Game formula: west corners (9.557 / 13 = 0.735), east corners (0.667 / 3 = 0.222); 1/32 precision.
      for (const h of west) expect(h).toBeCloseTo(0.735, 1);
      for (const h of east) expect(h).toBeCloseTo(0.222, 1);
      expect(Math.min(...west)).toBeGreaterThan(Math.max(...east));
    });

    it('hides faces between liquid blocks and draws a frame on sources', () => {
      // Two water sources side by side: 2 tops + 4 frame strips each, 6 outer sides + 2 bottoms; no shared side.
      const { mesher } = build([2, 1, 1], lavaPal, () => 4);
      const out = mesher.mesh(0, 0, 0, [true], null);
      const v = vertices(out.translucent);
      const normals: number[] = [];
      for (let i = 0; i < v.length; i += 4) normals.push(v[i].n);
      expect(normals.filter((n) => n === 1).length).toBe(2 + 8);
      expect(normals.filter((n) => n === 4 || n === 5).length).toBe(2); // only the outer west and east sides
      // Flat surface at 8/9 for two sources with air around: corners average with air.
      expect(out.solid.length).toBe(0);
    });

    it('draws the water inside waterlogged blocks, without a source frame', () => {
      const pal = [S('air'), S('oak_slab', { type: 'bottom', waterlogged: 'true' }), S('oak_slab', { type: 'bottom', waterlogged: 'false' })];
      const wet = build([1, 1, 1], pal, () => 1).mesher.mesh(0, 0, 0, [true], null);
      expect(quads(wet.translucent)).toBe(6); // top + 4 sides + bottom, no frame strips
      expect(quads(wet.solid)).toBeGreaterThan(0); // the slab itself
      const dry = build([1, 1, 1], pal, () => 2).mesher.mesh(0, 0, 0, [true], null);
      expect(quads(dry.translucent)).toBe(0);
    });

    it('fills to the top under the same liquid', () => {
      const { mesher } = build([1, 2, 1], lavaPal, () => 1);
      const v = vertices(mesher.mesh(0, 0, 0, [true], null).solid);
      // Lower block: no top face; its sides reach y = 1.
      const lowerSides = v.filter((c) => c.n >= 2 && c.p[1] <= 1);
      expect(Math.max(...lowerSides.map((c) => c.p[1]))).toBe(1);
    });
  });
});
