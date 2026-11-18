/**
 * Texture packs: a set of named square block textures plus their average
 * colors. The bundled default is Pixel Perfection CE (CC BY-SA 4.0); users can
 * also load their own resource pack or client.jar (see resourcePack.ts).
 */
import type { Rgba } from './colors';
import type { TextureSource } from './blockTables';
import { tintFor } from './tints';

export interface TexturePack extends TextureSource {
  id: string;
  name: string;
  tileSize: number;
  /** Returns RGBA pixels (tileSize^2 * 4) of a texture, untinted, or null. */
  pixels(name: string): Uint8ClampedArray | null;
}

/** Decodes an image (PNG bytes or blob) to RGBA pixels. Works on the main thread and in workers. */
export async function decodeImage(blob: Blob): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  } else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/** Average color of a tile (tinted), alpha = coverage. */
export function averageColor(px: Uint8ClampedArray, name: string): Rgba {
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < px.length; i += 4) {
    const al = px[i + 3] / 255;
    if (al === 0) continue;
    r += px[i] * al;
    g += px[i + 1] * al;
    b += px[i + 2] * al;
    a += al;
  }
  if (a === 0) return 0;
  const tint = tintFor(name);
  let R = r / a, G = g / a, B = b / a;
  if (tint) {
    R = (R * ((tint >> 16) & 255)) / 255;
    G = (G * ((tint >> 8) & 255)) / 255;
    B = (B * (tint & 255)) / 255;
  }
  const A = Math.round((a / (px.length / 4)) * 255);
  return ((Math.round(R) << 24) | (Math.round(G) << 16) | (Math.round(B) << 8) | A) >>> 0;
}

let ppPromise: Promise<TexturePack> | null = null;

/** Loads the bundled Pixel Perfection CE atlas (fetched lazily, cached by the browser). */
export function loadDefaultPack(): Promise<TexturePack> {
  if (!ppPromise) {
    ppPromise = (async () => {
      const base = `${import.meta.env.BASE_URL}textures/pixel-perfection/`;
      const [meta, img] = await Promise.all([
        fetch(`${base}atlas.json`).then((r) => {
          if (!r.ok) throw new Error(`Failed to load textures (${r.status})`);
          return r.json() as Promise<{ tile: number; cols: number; names: string[] }>;
        }),
        fetch(`${base}atlas.png`).then((r) => {
          if (!r.ok) throw new Error(`Failed to load textures (${r.status})`);
          return r.blob();
        }),
      ]);
      const atlas = await decodeImage(img);
      const T = meta.tile;
      const index = new Map(meta.names.map((n, i) => [n, i]));
      const colorCache = new Map<string, Rgba>();
      const pixels = (name: string): Uint8ClampedArray | null => {
        const i = index.get(name);
        if (i === undefined) return null;
        const ox = (i % meta.cols) * T;
        const oy = Math.floor(i / meta.cols) * T;
        const out = new Uint8ClampedArray(T * T * 4);
        for (let y = 0; y < T; y++) {
          const src = ((oy + y) * atlas.width + ox) * 4;
          out.set(atlas.data.subarray(src, src + T * 4), y * T * 4);
        }
        return out;
      };
      const pack: TexturePack = {
        id: 'pixel-perfection',
        name: 'Pixel Perfection CE',
        tileSize: T,
        has: (n) => index.has(n),
        color: (n) => {
          let c = colorCache.get(n);
          if (c === undefined) {
            const px = pixels(n);
            c = px ? averageColor(px, n) : 0;
            colorCache.set(n, c);
          }
          return c || undefined;
        },
        pixels,
      };
      return pack;
    })();
    ppPromise.catch(() => {
      ppPromise = null;
    });
  }
  return ppPromise;
}

/**
 * Builds the RGBA data of a texture array with one layer per appearance.
 * Layer i holds the texture of appearance i (tinted), or stays empty.
 */
export function buildLayerData(
  pack: TexturePack,
  appearances: { texture: string | null }[],
  maxLayers: number,
): { data: Uint8Array; size: number; layers: number; textured: boolean[] } {
  const T = pack.tileSize;
  const layers = Math.max(1, Math.min(appearances.length, maxLayers));
  const data = new Uint8Array(T * T * 4 * layers);
  const textured = appearances.map(() => false);
  for (let i = 0; i < layers; i++) {
    const name = appearances[i].texture;
    if (!name) continue;
    const px = pack.pixels(name);
    if (!px) continue;
    const tint = tintFor(name);
    const off = i * T * T * 4;
    for (let p = 0; p < T * T * 4; p += 4) {
      let r = px[p], g = px[p + 1], b = px[p + 2];
      if (tint) {
        r = (r * ((tint >> 16) & 255)) / 255;
        g = (g * ((tint >> 8) & 255)) / 255;
        b = (b * (tint & 255)) / 255;
      }
      data[off + p] = r;
      data[off + p + 1] = g;
      data[off + p + 2] = b;
      data[off + p + 3] = px[p + 3];
    }
    // Grass block sides: draw the tinted overlay on top of the dirt-colored base.
    if (name === 'grass_block_side') {
      const ov = pack.pixels('grass_block_side_overlay');
      const t = tintFor('grass_block_side_overlay');
      if (ov) {
        for (let p = 0; p < T * T * 4; p += 4) {
          const a = ov[p + 3] / 255;
          if (a === 0) continue;
          data[off + p] = data[off + p] * (1 - a) + ((ov[p] * ((t >> 16) & 255)) / 255) * a;
          data[off + p + 1] = data[off + p + 1] * (1 - a) + ((ov[p + 1] * ((t >> 8) & 255)) / 255) * a;
          data[off + p + 2] = data[off + p + 2] * (1 - a) + ((ov[p + 2] * (t & 255)) / 255) * a;
        }
      }
    }
    textured[i] = true;
  }
  return { data, size: T, layers, textured };
}
