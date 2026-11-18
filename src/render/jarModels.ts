/**
 * Builds block models from a resource pack's blockstates and models JSON
 * (as found in the user's client.jar). Supports variants, multipart,
 * parent inheritance, texture variables, element rotation, model x/y
 * rotation and uvlock. Render flags (opaque, translucent, cull groups) are
 * taken from the built-in classification because the game defines them in code.
 */
import type { BlockState } from '../parser/types';
import { shortName } from '../parser/types';
import type { ModelProvider } from './blockTables';
import { builtinModel } from './models';
import { DIRS, type Dir, type ElementDef, type FaceDef, type ModelDef, type QuadDef, type V3 } from './modelTypes';

type Json = Record<string, unknown>;

interface RawFace {
  uv?: number[];
  texture?: string;
  cullface?: string;
  rotation?: number;
}
interface RawElement {
  from: number[];
  to: number[];
  rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean };
  faces?: Record<string, RawFace>;
}
interface RawModel {
  parent?: string;
  textures?: Record<string, string>;
  elements?: RawElement[];
}
interface VariantRef {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
}

function modelKey(ref: string): string {
  let r = ref.startsWith('minecraft:') ? ref.slice(10) : ref;
  if (r.startsWith('block/')) r = r.slice(6);
  return r;
}

function textureName(ref: string): string | null {
  const r = ref.startsWith('minecraft:') ? ref.slice(10) : ref;
  if (r.startsWith('block/')) return r.slice(6);
  return null;
}

const DIR_V: Record<Dir, V3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

function dirOf(v: V3): Dir {
  for (const d of DIRS) {
    const w = DIR_V[d];
    if (Math.round(v[0]) === w[0] && Math.round(v[1]) === w[1] && Math.round(v[2]) === w[2]) return d;
  }
  return 'up';
}

/** Rotates a centered vector by quarter turns: X first (vanilla direction), then Y. */
function rotVec(v: V3, xr: number, yr: number): V3 {
  let [x, y, z] = v;
  for (let i = 0; i < ((xr / 90) % 4 + 4) % 4; i++) [y, z] = [z, -y];
  for (let i = 0; i < ((yr / 90) % 4 + 4) % 4; i++) [x, z] = [-z, x];
  return [x, y, z];
}

function rotPoint(p: V3, xr: number, yr: number): V3 {
  const r = rotVec([p[0] - 8, p[1] - 8, p[2] - 8], xr, yr);
  return [r[0] + 8, r[1] + 8, r[2] + 8];
}

export class JarModels {
  private readonly resolved = new Map<string, { elements: RawElement[]; textures: Record<string, string> } | null>();

  constructor(
    private readonly models: Record<string, unknown>,
    private readonly blockstates: Record<string, unknown>,
  ) {}

  get blockstateCount(): number {
    return Object.keys(this.blockstates).length;
  }

  private resolve(ref: string, depth = 0): { elements: RawElement[]; textures: Record<string, string> } | null {
    const key = modelKey(ref);
    if (this.resolved.has(key)) return this.resolved.get(key)!;
    if (depth > 20) return null;
    const m = this.models[key] as RawModel | undefined;
    let result: { elements: RawElement[]; textures: Record<string, string> } | null = null;
    if (m) {
      const parent = m.parent && !m.parent.startsWith('builtin/') ? this.resolve(m.parent, depth + 1) : null;
      result = {
        elements: m.elements ?? parent?.elements ?? [],
        textures: { ...(parent?.textures ?? {}), ...(m.textures ?? {}) },
      };
    }
    this.resolved.set(key, result);
    return result;
  }

  private tex(ref: string | undefined, textures: Record<string, string>): string | null {
    let r = ref;
    for (let i = 0; i < 10 && r && r.startsWith('#'); i++) r = textures[r.slice(1)];
    if (!r || r.startsWith('#')) return null;
    return textureName(r);
  }

  /** Model references selected by the blockstate file for this state. */
  private select(state: BlockState): VariantRef[] | null {
    const name = shortName(state.name);
    if (name.includes(':')) return null;
    const bs = this.blockstates[name] as Json | undefined;
    if (!bs) return null;
    const pick = (v: unknown): VariantRef | null => {
      const one = Array.isArray(v) ? v[0] : v;
      return one && typeof one === 'object' && typeof (one as VariantRef).model === 'string' ? (one as VariantRef) : null;
    };
    const props = state.props;
    if (bs.variants && typeof bs.variants === 'object') {
      for (const [k, v] of Object.entries(bs.variants as Json)) {
        const ok =
          k === '' ||
          k === 'normal' ||
          k.split(',').every((c) => {
            const [pk, pv] = c.split('=');
            return props[pk] === undefined || props[pk] === pv;
          });
        if (ok) {
          const r = pick(v);
          return r ? [r] : null;
        }
      }
      return null;
    }
    if (Array.isArray(bs.multipart)) {
      const out: VariantRef[] = [];
      const test = (when: unknown): boolean => {
        if (!when || typeof when !== 'object') return true;
        const w = when as Json;
        if (Array.isArray(w.OR)) return w.OR.some(test);
        if (Array.isArray(w.AND)) return w.AND.every(test);
        return Object.entries(w).every(([pk, pv]) => String(pv).split('|').includes(props[pk] ?? ''));
      };
      for (const part of bs.multipart as Json[]) {
        if (!test(part.when)) continue;
        const apply = part.apply;
        for (const a of Array.isArray(apply) ? apply : [apply]) {
          const r = pick(a);
          if (r) out.push(r);
        }
      }
      return out;
    }
    return null;
  }

  /** Geometry for a state, or null when the pack has no usable model for it. */
  geometry(state: BlockState): { elements: ElementDef[]; quads: QuadDef[] } | null {
    const refs = this.select(state);
    if (!refs || refs.length === 0) return null;
    const elements: ElementDef[] = [];
    const quads: QuadDef[] = [];
    for (const ref of refs) {
      const model = this.resolve(ref.model);
      if (!model) continue;
      const xr = ref.x ?? 0;
      const yr = ref.y ?? 0;
      for (const el of model.elements) this.convert(el, model.textures, xr, yr, !!ref.uvlock, elements, quads);
    }
    if (elements.length === 0 && quads.length === 0) return null;
    return { elements, quads };
  }

  private convert(el: RawElement, textures: Record<string, string>, xr: number, yr: number, uvlock: boolean, elements: ElementDef[], quads: QuadDef[]): void {
    const from = el.from as V3;
    const to = el.to as V3;
    const angle = el.rotation?.angle ?? 0;
    const faces = el.faces ?? {};
    if (angle !== 0 && el.rotation) {
      // Rotated element: emit free quads.
      for (const d of DIRS) {
        const f = faces[d];
        if (!f) continue;
        const t = this.tex(f.texture, textures);
        if (!t) continue;
        const corners = faceCornersRaw(d, from, to).map((p) => rotatePoint(p, el.rotation!)).map((p) => rotPoint(p, xr, yr));
        const uv = (f.uv as [number, number, number, number]) ?? autoUv(d, from, to);
        let uvs: [number, number][] = [
          [uv[0], uv[3]],
          [uv[2], uv[3]],
          [uv[2], uv[1]],
          [uv[0], uv[1]],
        ];
        uvs = cycle(uvs, ((f.rotation ?? 0) / 90) | 0);
        quads.push({ pos: corners as QuadDef['pos'], uv: uvs as QuadDef['uv'], tex: t });
      }
      return;
    }
    const a = rotPoint(from, xr, yr);
    const b = rotPoint(to, xr, yr);
    const nf: V3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const nt: V3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    const out: Partial<Record<Dir, FaceDef>> = {};
    for (const d of DIRS) {
      const f = faces[d];
      if (!f) continue;
      const t = this.tex(f.texture, textures);
      if (!t) continue;
      const nd = dirOf(rotVec(DIR_V[d], xr, yr));
      const def: FaceDef = { tex: t };
      if (f.cullface && (DIRS as readonly string[]).includes(f.cullface)) def.cull = dirOf(rotVec(DIR_V[f.cullface as Dir], xr, yr));
      let rot = f.rotation ?? 0;
      if (!uvlock) {
        if (f.uv) def.uv = f.uv as [number, number, number, number];
        // Approximate texture rotation caused by rotating the whole model.
        if (nd === 'up') rot += yr;
        else if (nd === 'down') rot -= yr;
        if (d === 'east' || d === 'west') rot += d === 'east' ? xr : -xr;
      }
      rot = ((rot % 360) + 360) % 360;
      if (rot) def.rot = rot;
      out[nd] = def;
    }
    elements.push({ from: nf, to: nt, faces: out });
  }

  /** A model provider: pack geometry with built-in render flags; built-in model as fallback. */
  provider(): ModelProvider {
    const cache = new Map<string, ModelDef>();
    return (state, key) => {
      let m = cache.get(key);
      if (m) return m;
      const base = builtinModel(state, key);
      const g = base.elements.length || base.quads?.length ? this.geometry(state) : null;
      m = g ? { ...base, elements: g.elements, quads: g.quads, color: undefined } : base;
      cache.set(key, m);
      return m;
    };
  }
}

function cycle<T>(a: T[], n: number): T[] {
  const k = ((n % a.length) + a.length) % a.length;
  return a.slice(k).concat(a.slice(0, k));
}

function autoUv(d: Dir, f: number[], t: number[]): [number, number, number, number] {
  switch (d) {
    case 'down':
      return [f[0], 16 - t[2], t[0], 16 - f[2]];
    case 'up':
      return [f[0], f[2], t[0], t[2]];
    case 'north':
      return [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]];
    case 'south':
      return [f[0], 16 - t[1], t[0], 16 - f[1]];
    case 'west':
      return [f[2], 16 - t[1], t[2], 16 - f[1]];
    case 'east':
      return [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]];
  }
}

function faceCornersRaw(d: Dir, f: number[], t: number[]): V3[] {
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

function rotatePoint(p: V3, r: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean }): V3 {
  const a = (r.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = r.origin;
  let x = p[0] - o[0];
  let y = p[1] - o[1];
  let z = p[2] - o[2];
  const k = r.rescale ? 1 / Math.cos(Math.abs(a)) : 1;
  if (r.axis === 'y') [x, z] = [(x * c + z * s) * k, (-x * s + z * c) * k];
  else if (r.axis === 'x') [y, z] = [(y * c - z * s) * k, (y * s + z * c) * k];
  else [x, y] = [(x * c - y * s) * k, (x * s + y * c) * k];
  return [x + o[0], y + o[1], z + o[2]];
}
