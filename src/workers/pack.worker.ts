/// <reference lib="webworker" />
/**
 * Reads a client.jar or resource pack (.zip) in the background: extracts block
 * textures (decoded to RGBA), block models, blockstates and the English
 * language file. Nothing leaves the browser.
 */
import { listZip, readEntry } from '../util/zip';

export interface ProcessedPack {
  name: string;
  tile: number;
  names: string[];
  /** RGBA pixels of all textures, tile*tile*4 bytes each, in `names` order. */
  pixels: Uint8Array;
  models: Record<string, unknown>;
  blockstates: Record<string, unknown>;
  lang: Record<string, string> | null;
  warnings: string[];
}

const TEX = 'assets/minecraft/textures/block/';
const MODELS = 'assets/minecraft/models/block/';
const STATES = 'assets/minecraft/blockstates/';
const LANG = 'assets/minecraft/lang/en_us.json';

async function decode(png: Uint8Array): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const bmp = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { w: img.width, h: img.height, data: img.data };
}

/** Nearest-neighbour resample of the first (top) frame to size x size. */
function firstFrame(src: { w: number; h: number; data: Uint8ClampedArray }, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const frame = Math.min(src.w, src.h);
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * frame) / size);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * frame) / size);
      const si = (sy * src.w + sx) * 4;
      const di = (y * size + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

self.onmessage = async (e: MessageEvent<{ bytes: Uint8Array; name: string }>) => {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser cannot decode textures in the background (OffscreenCanvas is missing). Please use a recent browser.');
    const { bytes, name } = e.data;
    const entries = listZip(bytes);
    const warnings: string[] = [];
    // Resource packs may wrap everything in a top folder: find the "assets/minecraft/" prefix.
    const norm = (n: string) => {
      const i = n.indexOf('assets/minecraft/');
      return i >= 0 ? n.slice(i) : null;
    };
    const textures: { name: string; png: Uint8Array }[] = [];
    const models: Record<string, unknown> = {};
    const blockstates: Record<string, unknown> = {};
    let lang: Record<string, string> | null = null;
    let legacy = false;
    for (const ent of entries) {
      const n = norm(ent.name);
      if (!n) continue;
      if (n.startsWith('assets/minecraft/textures/blocks/')) legacy = true;
      // Subfolders are allowed (e.g. "block/tripwire/tripwire.png" -> "tripwire/tripwire").
      if (n.startsWith(TEX) && n.endsWith('.png')) {
        textures.push({ name: n.slice(TEX.length, -4), png: await readEntry(bytes, ent) });
      } else if (n.startsWith(MODELS) && n.endsWith('.json')) {
        try {
          models[n.slice(MODELS.length, -5)] = JSON.parse(new TextDecoder().decode(await readEntry(bytes, ent)));
        } catch {
          /* skip invalid model */
        }
      } else if (n.startsWith(STATES) && n.endsWith('.json')) {
        try {
          blockstates[n.slice(STATES.length, -5)] = JSON.parse(new TextDecoder().decode(await readEntry(bytes, ent)));
        } catch {
          /* skip invalid blockstate */
        }
      } else if (n === LANG) {
        try {
          lang = JSON.parse(new TextDecoder().decode(await readEntry(bytes, ent)));
        } catch {
          /* ignore */
        }
      }
    }
    if (textures.length === 0) {
      throw new Error(
        legacy
          ? 'This looks like a Minecraft 1.12 or older pack (textures/blocks). Please use a client.jar or resource pack from 1.13 or newer; it will still work with 1.12 schematics.'
          : 'No block textures were found in this file. Choose a Minecraft client.jar or a resource pack (.zip).',
      );
    }
    const decoded: { name: string; img: { w: number; h: number; data: Uint8ClampedArray } }[] = [];
    const widths = new Map<number, number>();
    for (const t of textures) {
      try {
        const img = await decode(t.png);
        if (img.w < 1 || img.h < img.w || img.h % img.w !== 0) continue;
        decoded.push({ name: t.name, img });
        widths.set(img.w, (widths.get(img.w) ?? 0) + 1);
      } catch {
        /* skip undecodable image */
      }
    }
    // Use the most common resolution, capped at 64 px to keep GPU memory small.
    let tile = 16;
    let best = 0;
    for (const [w, c] of widths) if (c > best) [tile, best] = [w, c];
    if (tile > 64) {
      warnings.push(`Textures were downscaled from ${tile}x to 64x.`);
      tile = 64;
    }
    const pixels = new Uint8Array(decoded.length * tile * tile * 4);
    decoded.forEach((d, i) => pixels.set(firstFrame(d.img, tile), i * tile * tile * 4));
    const result: ProcessedPack = {
      name: name.replace(/\.(jar|zip)$/i, ''),
      tile,
      names: decoded.map((d) => d.name),
      pixels,
      models,
      blockstates,
      lang,
      warnings,
    };
    scope.postMessage({ ok: true, pack: result }, [pixels.buffer]);
  } catch (err) {
    scope.postMessage({ ok: false, message: (err as Error).message });
  }
};
