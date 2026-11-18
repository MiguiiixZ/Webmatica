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

  /** Draws a texture (or flat color) into the unit square mapped by the current transform. */
  private face(ctx: Canvas2D, app: number, shade: number): void {
    const { tile, color } = this.appearance(app);
    if (tile) ctx.drawImage(tile, 0, 0, 1, 1);
    else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
    }
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, 1, 1);
    }
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
    const { tables, models } = this.compiled;
    const m = models[id];
    let up = 0, south = 0, east = 0;
    let minY = 0, maxY = 16;
    let box = false;
    if (tables.flags[id] & FLAG_CUBE) {
      up = tables.cubeFaces[id * 6 + 1] & 0xfff;
      south = tables.cubeFaces[id * 6 + 3] & 0xfff;
      east = tables.cubeFaces[id * 6 + 5] & 0xfff;
      box = true;
    } else if (m && m.elements.length) {
      // Box-like shapes (slabs, stairs, carpets, chests...): draw their bounding box.
      minY = Math.min(...m.elements.map((e) => e.from[1]));
      maxY = Math.max(...m.elements.map((e) => e.to[1]));
      const q0 = tables.quadStart[id];
      const q1 = tables.quadStart[id + 1];
      const pick = (normal: number) => {
        for (let q = q0; q < q1; q++) if ((tables.quads[q * QUAD_STRIDE + 12] & 7) === normal) return tables.quads[q * QUAD_STRIDE + 13];
        return q1 > q0 ? tables.quads[q0 * QUAD_STRIDE + 13] : 0;
      };
      up = pick(1);
      south = pick(3);
      east = pick(5);
      // Very thin things (rails, plates, carpets are fine as boxes; panes and bars are not).
      const minX = Math.min(...m.elements.map((e) => e.from[0]));
      const maxX = Math.max(...m.elements.map((e) => e.to[0]));
      const minZ = Math.min(...m.elements.map((e) => e.from[2]));
      const maxZ = Math.max(...m.elements.map((e) => e.to[2]));
      box = maxX - minX >= 10 && maxZ - minZ >= 10;
      if (!box) {
        this.sprite(ctx, south || up, id);
        return;
      }
    } else {
      // Plants, dust, torches...: a flat sprite of the first quad's texture.
      const q0 = tables.quadStart[id];
      const app = tables.quadStart[id + 1] > q0 ? tables.quads[q0 * QUAD_STRIDE + 13] : 0;
      this.sprite(ctx, app, id);
      return;
    }
    if (box) this.cube(ctx, up, south, east, minY, maxY);
  }

  /** Flat icon; prefers a texture named like the block (lever, torch, rail...) when the pack has one. */
  private sprite(ctx: Canvas2D, app: number, id: number): void {
    ctx.setTransform(SIZE * 0.84, 0, 0, SIZE * 0.84, SIZE * 0.08, SIZE * 0.08);
    const name = this.palette[id].name.replace(/^minecraft:/, '').replace('_wall_', '_');
    const own = this.pack?.has(name) ? this.tile(name) : null;
    if (own) ctx.drawImage(own, 0, 0, 1, 1);
    else this.face(ctx, app, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Isometric box; heights in pixels (0..16). */
  private cube(ctx: Canvas2D, up: number, south: number, east: number, minY: number, maxY: number): void {
    const w = SIZE * 0.88; // width of the cube
    const q = w / 4; // vertical offset of the top rhombus corners
    const hs = w * 0.56; // full side height
    const cx = SIZE / 2;
    const y0 = (SIZE - (2 * q + hs)) / 2 + ((16 - maxY) / 16) * hs;
    const h = ((maxY - minY) / 16) * hs;
    const T = { x: cx, y: y0 };
    const L = { x: cx - w / 2, y: y0 + q };
    const R = { x: cx + w / 2, y: y0 + q };
    const B = { x: cx, y: y0 + 2 * q };
    // Top face: origin at T, u towards R, v towards L.
    ctx.setTransform(R.x - T.x, R.y - T.y, L.x - T.x, L.y - T.y, T.x, T.y);
    this.face(ctx, up, 0);
    // Left (south) face: origin L, u towards B, v down; texture rows taken from the box height.
    ctx.setTransform(B.x - L.x, B.y - L.y, 0, h, L.x, L.y);
    this.face(ctx, south, 0.18);
    // Right (east) face.
    ctx.setTransform(R.x - B.x, R.y - B.y, 0, h, B.x, B.y);
    this.face(ctx, east, 0.36);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
