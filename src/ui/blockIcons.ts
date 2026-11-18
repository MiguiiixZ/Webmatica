/**
 * Inventory-style icons for the Material List, drawn in the browser from the
 * active texture pack: full blocks as isometric cubes (top, left and right
 * faces with shading), low blocks with their height (slabs, carpets...), and
 * plants, dust, torches and other non-box shapes as flat sprites.
 */
import type { BlockState } from '../parser/types';
import { stateKey } from '../parser/types';
import { FLAG_CUBE, QUAD_STRIDE, type CompileResult } from '../render/blockTables';
import type { TexturePack } from '../render/texturePack';
import { tintFor } from '../render/tints';
import { rgbaToCss } from '../render/colors';

const SIZE = 64; // drawn at 2x for sharp icons on high-DPI screens

type Canvas2D = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class IconRenderer {
  private readonly cache = new Map<string, string>();
  private readonly tiles = new Map<string, HTMLCanvasElement | null>();

  constructor(
    private readonly compiled: CompileResult,
    private readonly pack: TexturePack | null,
    private readonly palette: BlockState[],
  ) {}

  /** A tinted texture as a small canvas, or null when the pack does not have it. */
  private tile(name: string | null): HTMLCanvasElement | null {
    if (!name || !this.pack) return null;
    if (this.tiles.has(name)) return this.tiles.get(name)!;
    const px = this.pack.pixels(name);
    let c: HTMLCanvasElement | null = null;
    if (px) {
      const T = this.pack.tileSize;
      const data = new Uint8ClampedArray(px);
      const tint = tintFor(name);
      if (tint) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = (data[i] * ((tint >> 16) & 255)) / 255;
          data[i + 1] = (data[i + 1] * ((tint >> 8) & 255)) / 255;
          data[i + 2] = (data[i + 2] * (tint & 255)) / 255;
        }
      }
      c = makeCanvas(T, T);
      c.getContext('2d')!.putImageData(new ImageData(data, T, T), 0, 0);
    }
    this.tiles.set(name, c);
    return c;
  }

  private appearance(app: number): { tile: HTMLCanvasElement | null; color: string } {
    const a = this.compiled.registry.list[app];
    return { tile: this.tile(a?.texture ?? null), color: a ? rgbaToCss(a.color) : '#888' };
  }

  /** Data URL of the icon for a palette entry. */
  icon(paletteId: number): string {
    const key = stateKey(this.palette[paletteId]);
    let url = this.cache.get(key);
    if (url) return url;
    const c = makeCanvas(SIZE, SIZE);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.draw(ctx, paletteId);
    url = c.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  private draw(ctx: Canvas2D, id: number): void {
    const quads = this.modelQuads(id);
    const m = this.compiled.models[id];
    // Plants, dust, rails...: only diagonal or flat double-sided quads -> 2D sprite like in the inventory.
    const solid = quads.filter((q) => q.normal !== 6);
    if (solid.length === 0) {
      this.sprite(ctx, quads[0]?.app ?? 0, id);
      return;
    }
    // Small thin items (torches, levers, panes, bars...) read better as sprites.
    if (m && !(this.compiled.tables.flags[id] & FLAG_CUBE)) {
      const xs = solid.flatMap((q) => q.pos.map((p) => p[0]));
      const zs = solid.flatMap((q) => q.pos.map((p) => p[2]));
      const w = Math.max(...xs) - Math.min(...xs);
      const d = Math.max(...zs) - Math.min(...zs);
      const name = this.palette[id].name.replace(/^minecraft:/, '').replace('_wall_', '_');
      if (w < 7 && d < 7 && ITEM_LIKE.test(name) && this.pack?.has(name)) {
        this.sprite(ctx, solid[0].app, id);
        return;
      }
    }
    this.iso(ctx, quads);
  }

  /** All quads of a block model in block pixels (0..16), with per-corner UVs in pixels. */
  private modelQuads(id: number): IconQuad[] {
    const { tables } = this.compiled;
    const out: IconQuad[] = [];
    if (tables.flags[id] & FLAG_CUBE) {
      const faces: [number, V3[]][] = [
        [1, [[0, 16, 16], [16, 16, 16], [16, 16, 0], [0, 16, 0]]],
        [3, [[0, 0, 16], [16, 0, 16], [16, 16, 16], [0, 16, 16]]],
        [5, [[16, 0, 16], [16, 0, 0], [16, 16, 0], [16, 16, 16]]],
      ];
      for (const [n, pos] of faces) {
        const f = tables.cubeFaces[id * 6 + n];
        out.push({ pos, uv: pos.map((p) => projectedUv(n, p, (f >> 12) & 3)), normal: n, app: f & 0xfff });
      }
      return out;
    }
    for (let q = tables.quadStart[id]; q < tables.quadStart[id + 1]; q++) {
      const b = q * QUAD_STRIDE;
      const meta = tables.quads[b + 12];
      const normal = meta & 7;
      const explicit = (meta >> 6) & 1;
      const rot = (meta >> 7) & 3;
      const pos: V3[] = [0, 1, 2, 3].map((v) => [tables.quads[b + v * 3] / 2, tables.quads[b + v * 3 + 1] / 2, tables.quads[b + v * 3 + 2] / 2]);
      const uv: [number, number][] = explicit
        ? [0, 1, 2, 3].map((v) => {
            const pk = tables.quads[b + 14 + v];
            return [pk & 31, pk >> 5] as [number, number];
          })
        : pos.map((p) => projectedUv(normal, p, rot));
      out.push({ pos, uv, normal, app: tables.quads[b + 13] });
    }
    return out;
  }

  /** Software isometric rendering (painter's algorithm) of the visible faces. */
  private iso(ctx: Canvas2D, quads: IconQuad[]): void {
    const k = SIZE * 0.031; // pixels per model pixel
    const cx = SIZE / 2;
    const cy = SIZE / 2 + 8 * k * 0.5;
    const proj = (p: V3): [number, number] => [cx + (p[0] - p[2]) * k * 0.866, cy + (p[0] + p[2] - 16) * k * 0.5 - (p[1] - 8) * k];
    // Faces pointing away from the viewer (down, north, west) are hidden.
    const visible = quads.filter((q) => q.normal === 1 || q.normal === 3 || q.normal === 5 || q.normal === 6);
    const depth = (q: IconQuad) => q.pos.reduce((s, p) => s + p[0] + p[1] + p[2], 0) / 4;
    visible.sort((a, b) => depth(a) - depth(b));
    const shade = [0.45, 0, 0.3, 0.18, 0.3, 0.36, 0.1];
    for (const q of visible) {
      const P = q.pos.map(proj);
      const { tile, color } = this.appearance(q.app);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]);
      ctx.closePath();
      ctx.clip();
      if (tile) {
        // Affine map from texture pixels (u, v) to screen using corners 0, 1 and 3.
        const [u0, v0] = q.uv[0];
        const e1 = [q.uv[1][0] - u0, q.uv[1][1] - v0];
        const e2 = [q.uv[3][0] - u0, q.uv[3][1] - v0];
        const det = e1[0] * e2[1] - e2[0] * e1[1];
        if (Math.abs(det) > 1e-6) {
          const s1 = [P[1][0] - P[0][0], P[1][1] - P[0][1]];
          const s2 = [P[3][0] - P[0][0], P[3][1] - P[0][1]];
          // A = [s1 s2] * inverse([e1 e2])
          const i00 = e2[1] / det, i01 = -e2[0] / det, i10 = -e1[1] / det, i11 = e1[0] / det;
          const a = s1[0] * i00 + s2[0] * i10;
          const bb = s1[1] * i00 + s2[1] * i10;
          const c = s1[0] * i01 + s2[0] * i11;
          const d = s1[1] * i01 + s2[1] * i11;
          ctx.setTransform(a, bb, c, d, P[0][0] - a * u0 - c * v0, P[0][1] - bb * u0 - d * v0);
          ctx.drawImage(tile, 0, 0, 16, 16);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      const sh = shade[q.normal] ?? 0;
      if (sh > 0) {
        ctx.fillStyle = `rgba(0,0,0,${sh})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Flat icon; prefers a texture named like the block (lever, torch, rail...) when the pack has one. */
  private sprite(ctx: Canvas2D, app: number, id: number): void {
    ctx.setTransform(SIZE * 0.84 / 16, 0, 0, SIZE * 0.84 / 16, SIZE * 0.08, SIZE * 0.08);
    const name = this.palette[id].name.replace(/^minecraft:/, '').replace('_wall_', '_');
    const own = this.pack?.has(name) ? this.tile(name) : null;
    if (own) ctx.drawImage(own, 0, 0, 16, 16);
    else {
      const { tile, color } = this.appearance(app);
      if (tile) ctx.drawImage(tile, 0, 0, 16, 16);
      else {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 16, 16);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

type V3 = [number, number, number];

/** Blocks whose block texture already looks like their inventory icon. */
const ITEM_LIKE = /(torch|lever|ladder|tripwire_hook|iron_bars|_pane|rail|vine|lily_pad|cobweb|sapling)$/;

interface IconQuad {
  pos: V3[];
  uv: [number, number][];
  normal: number;
  app: number;
}

/** Automatic UVs from positions, matching the chunk shader (pixels, 0..16). */
function projectedUv(normal: number, p: V3, rot: number): [number, number] {
  const [x, y, z] = p;
  let uv: [number, number];
  switch (normal) {
    case 0: uv = [x, 16 - z]; break;
    case 1: uv = [x, z]; break;
    case 2: uv = [16 - x, 16 - y]; break;
    case 3: uv = [x, 16 - y]; break;
    case 4: uv = [z, 16 - y]; break;
    default: uv = [16 - z, 16 - y];
  }
  for (let i = 0; i < rot; i++) uv = [16 - uv[1], uv[0]];
  return uv;
}
