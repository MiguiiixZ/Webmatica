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
    out.push({ p: [(w0 & 1023) / 32, ((w0 >> 10) & 1023) / 32, ((w0 >> 20) & 1023) / 32], n: a[i + 1] & 7 });
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

  it('culls faces across chunk borders', () => {
    const { mesher } = build([32, 1, 1], palette, () => 1);
    const a = mesher.mesh(0, 0, 0, [true], null);
    const b = mesher.mesh(1, 0, 0, [true], null);
    // Each half: 4 long sides + one end cap; the faces at x = 16 are hidden.
    expect(quads(a.solid)).toBe(5);
    expect(quads(b.solid)).toBe(5);
  });

  it('lists non-empty chunks', () => {
    const { volume } = build([40, 1, 1], palette, (x) => (x === 39 ? 1 : 0));
    const ne = nonEmptyChunks([{ offset: [0, 0, 0], volume }], [40, 1, 1]);
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
});
