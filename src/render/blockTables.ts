/**
 * Compiles block models into compact typed-array tables consumed by the mesh
 * workers. Tables are built once per schematic (palette) and texture set.
 *
 * Positions inside a block and UVs use pixels (1/16 block).
 */
import type { BlockState } from '../parser/types';
import { stateKey } from '../parser/types';
import { fallbackColor, type Rgba } from './colors';
import { DIR_INDEX, DIRS, NORMAL_NONE, RenderLayer, type Dir, type FaceDef, type ModelDef } from './modelTypes';

export const QUAD_STRIDE = 18;
export const FLAG_OCCLUDES = 1;
export const FLAG_CUBE = 2;
export const FLAG_TRANSLUCENT = 4;
export const FLAG_EMPTY = 8;
export const CULL_NONE = 7;

/** Table data sent to mesh workers. */
export interface RenderTables {
  paletteSize: number;
  flags: Uint8Array;
  /** Cull group per palette entry (0 = none). */
  cullGroup: Uint16Array;
  /** For FLAG_CUBE entries: 6 faces, each appearance | (texture rotation << 12). */
  cubeFaces: Uint16Array;
  /** Quad list range per palette entry: quads[quadStart[i] .. quadStart[i+1]). In quads. */
  quadStart: Uint32Array;
  /** QUAD_STRIDE uint16 per quad, see packQuad. */
  quads: Uint16Array;
}

export interface Appearance {
  /** Texture name candidates ("a|b"). */
  candidates: string;
  /** Resolved texture name in the active set, or null. */
  texture: string | null;
  color: Rgba;
}

export interface TextureSource {
  has(name: string): boolean;
  color(name: string): Rgba | undefined;
}

export type ModelProvider = (state: BlockState, key: string) => ModelDef;

/** Registry of the distinct face appearances (texture + color) used by a schematic. */
export class AppearanceRegistry {
  readonly list: Appearance[] = [{ candidates: '', texture: null, color: 0xff00ffff }];
  private readonly ids = new Map<string, number>();

  constructor(private readonly source: TextureSource | null) {}

  get(candidates: string, colorOverride?: string): number {
    const key = colorOverride ? `${candidates}#${colorOverride}` : candidates;
    let id = this.ids.get(key);
    if (id !== undefined) return id;
    const names = candidates.split('|');
    let texture: string | null = null;
    if (this.source) for (const n of names) if (this.source.has(n)) {
      texture = n;
      break;
    }
    let color: Rgba;
    if (colorOverride) color = parseInt(colorOverride.length === 6 ? `${colorOverride}ff` : colorOverride, 16) >>> 0;
    else color = (texture ? this.source?.color(texture) : undefined) ?? fallbackColor(texture ?? names[0]);
    id = this.list.length;
    this.list.push({ candidates, texture: colorOverride ? null : texture, color });
    this.ids.set(key, id);
    return id;
  }
}

/** Packs a UV pair (0..16 pixels) into 10 bits. */
function packUv(u: number, v: number): number {
  const cu = Math.max(0, Math.min(16, Math.round(u)));
  const cv = Math.max(0, Math.min(16, Math.round(v)));
  return cu | (cv << 5);
}

const rotations: Record<number, number> = { 0: 0, 90: 1, 180: 2, 270: 3 };

/** Corner positions of an axis-aligned face, counter-clockwise seen from outside. */
function faceCorners(d: Dir, f: [number, number, number], t: [number, number, number]): [number, number, number][] {
  const [x0, y0, z0] = f;
  const [x1, y1, z1] = t;
  switch (d) {
    case 'down':
      return [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]];
    case 'up':
      return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
    case 'north':
      return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
    case 'south':
      return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    case 'west':
      return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    case 'east':
      return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
  }
}

function isFullCube(m: ModelDef): boolean {
  if (m.quads?.length || m.elements.length !== 1) return false;
  const e = m.elements[0];
  if (e.from.some((v) => v !== 0) || e.to.some((v) => v !== 16)) return false;
  return DIRS.every((d) => e.faces[d] && !e.faces[d]!.uv);
}

export interface CompileResult {
  tables: RenderTables;
  registry: AppearanceRegistry;
  models: ModelDef[];
}

/** Builds render tables for a palette. */
export function compileTables(palette: BlockState[], provider: ModelProvider, source: TextureSource | null): CompileResult {
  const n = palette.length;
  const registry = new AppearanceRegistry(source);
  const flags = new Uint8Array(n);
  const cullGroup = new Uint16Array(n);
  const cubeFaces = new Uint16Array(n * 6);
  const quadStart = new Uint32Array(n + 1);
  const quads: number[] = [];
  const groups = new Map<string, number>();
  const models: ModelDef[] = [];

  for (let i = 0; i < n; i++) {
    quadStart[i] = quads.length / QUAD_STRIDE;
    const st = palette[i];
    const m = i === 0 ? { elements: [], layer: RenderLayer.Solid, occludes: false } : provider(st, stateKey(st));
    models.push(m);
    let f = 0;
    if (m.occludes) f |= FLAG_OCCLUDES;
    if (m.layer === RenderLayer.Translucent) f |= FLAG_TRANSLUCENT;
    if (m.cullGroup) {
      let g = groups.get(m.cullGroup);
      if (g === undefined) {
        g = groups.size + 1;
        groups.set(m.cullGroup, g);
      }
      cullGroup[i] = g;
    }
    if (m.elements.length === 0 && !m.quads?.length) {
      flags[i] = f | FLAG_EMPTY;
      continue;
    }
    if (isFullCube(m)) {
      f |= FLAG_CUBE;
      const e = m.elements[0];
      for (let d = 0; d < 6; d++) {
        const face = e.faces[DIRS[d]] as FaceDef;
        cubeFaces[i * 6 + d] = registry.get(face.tex, m.color) | ((rotations[face.rot ?? 0] ?? 0) << 12);
      }
      flags[i] = f;
      continue;
    }
    flags[i] = f;
    for (const e of m.elements) {
      for (const d of DIRS) {
        const face = e.faces[d];
        if (!face) continue;
        // Skip degenerate faces of zero-thickness elements.
        const c = faceCorners(d, e.from, e.to);
        const app = registry.get(face.tex, m.color);
        const explicit = !!face.uv;
        let rot = rotations[face.rot ?? 0] ?? 0;
        let uvs: [number, number][] = explicit ? uvCorners(face.uv!) : [[0, 0], [0, 0], [0, 0], [0, 0]];
        if (explicit && rot) {
          // Rotate explicit UVs by cycling the corners (the shader rotation only suits repeating UVs).
          uvs = uvs.slice(rot).concat(uvs.slice(0, rot));
          rot = 0;
        }
        pushQuad(quads, c, DIR_INDEX[d], face.cull ? DIR_INDEX[face.cull] : CULL_NONE, explicit, rot, app, uvs);
      }
    }
    for (const q of m.quads ?? []) {
      const app = registry.get(q.tex, m.color);
      pushQuad(quads, q.pos, NORMAL_NONE, CULL_NONE, true, 0, app, q.uv);
    }
  }
  quadStart[n] = quads.length / QUAD_STRIDE;

  return {
    tables: { paletteSize: n, flags, cullGroup, cubeFaces, quadStart, quads: Uint16Array.from(quads) },
    registry,
    models,
  };
}

function uvCorners(uv: [number, number, number, number]): [number, number][] {
  const [u1, v1, u2, v2] = uv;
  return [
    [u1, v2],
    [u2, v2],
    [u2, v1],
    [u1, v1],
  ];
}

/**
 * Quad layout (uint16 x QUAD_STRIDE):
 *   0..11  four corners x,y,z in pixels (0..16)
 *   12     normal (3 bits) | cull dir (3 bits) << 3 | explicit uv (1 bit) << 6 | texture rotation (2 bits) << 7
 *   13     appearance id
 *   14..17 packed uv per corner (5 + 5 bits, pixels)
 */
function pushQuad(
  out: number[],
  corners: [number, number, number][],
  normal: number,
  cull: number,
  explicit: boolean,
  rot: number,
  app: number,
  uvs: [number, number][],
): void {
  for (const c of corners) out.push(Math.round(c[0]), Math.round(c[1]), Math.round(c[2]));
  out.push(normal | (cull << 3) | ((explicit ? 1 : 0) << 6) | (rot << 7));
  out.push(app);
  for (const [u, v] of uvs) out.push(packUv(u, v));
}
