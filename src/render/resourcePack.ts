/**
 * User texture packs (client.jar or resource pack .zip): processed in a worker,
 * stored in IndexedDB on this device only, and combined with the bundled
 * default pack for any texture the user's pack does not contain.
 */
import { db } from '../storage/db';
import type { ProcessedPack } from '../workers/pack.worker';
import PackWorker from '../workers/pack.worker.ts?worker';
import { averageColor, loadDefaultPack, type TexturePack } from './texturePack';
import { JarModels } from './jarModels';
import { setActivePack, type UserPack } from './packManager';
import { parseLanguageFile, setLanguageNames } from '../materials/names';
import { clearModelCache } from './models';
import type { Rgba } from './colors';

export interface PackInfo {
  name: string;
  textures: number;
  hasModels: boolean;
  hasLanguage: boolean;
  warnings: string[];
}

const STORE_KEY = 'active';

export function processPackFile(file: File): Promise<ProcessedPack> {
  return new Promise((resolve, reject) => {
    void file.arrayBuffer().then((buf) => {
      const w = new PackWorker();
      w.onmessage = (e: MessageEvent<{ ok: boolean; pack?: ProcessedPack; message?: string }>) => {
        w.terminate();
        if (e.data.ok && e.data.pack) resolve(e.data.pack);
        else reject(new Error(e.data.message ?? 'Unknown error'));
      };
      w.onerror = (e) => {
        w.terminate();
        reject(new Error(e.message || 'The texture pack could not be read.'));
      };
      const bytes = new Uint8Array(buf);
      w.postMessage({ bytes, name: file.name }, [bytes.buffer]);
    }, reject);
  });
}

function resample(px: Uint8ClampedArray, from: number, to: number): Uint8ClampedArray {
  if (from === to) return px;
  const out = new Uint8ClampedArray(to * to * 4);
  for (let y = 0; y < to; y++) {
    const sy = Math.floor((y * from) / to);
    for (let x = 0; x < to; x++) {
      const sx = Math.floor((x * from) / to);
      out.set(px.subarray((sy * from + sx) * 4, (sy * from + sx) * 4 + 4), (y * to + x) * 4);
    }
  }
  return out;
}

async function buildPack(p: ProcessedPack): Promise<{ pack: UserPack; info: PackInfo }> {
  const T = p.tile;
  const index = new Map(p.names.map((n, i) => [n, i]));
  const fallback = await loadDefaultPack().catch(() => null);
  const colors = new Map<string, Rgba>();
  const own = (n: string): Uint8ClampedArray | null => {
    const i = index.get(n);
    if (i === undefined) return null;
    return new Uint8ClampedArray(p.pixels.buffer, p.pixels.byteOffset + i * T * T * 4, T * T * 4);
  };
  const pixels = (n: string): Uint8ClampedArray | null => {
    const o = own(n);
    if (o) return o.slice();
    const f = fallback?.pixels(n);
    return f ? resample(f, fallback!.tileSize, T) : null;
  };
  const hasModels = Object.keys(p.blockstates).length > 50 && Object.keys(p.models).length > 50;
  const pack: UserPack = {
    id: `user:${p.name}`,
    name: p.name,
    tileSize: T,
    has: (n) => index.has(n) || !!fallback?.has(n),
    color: (n) => {
      let c = colors.get(n);
      if (c === undefined) {
        const px = own(n);
        c = px ? averageColor(px, n) : (fallback?.color(n) ?? 0);
        colors.set(n, c);
      }
      return c || undefined;
    },
    pixels,
  };
  if (hasModels) pack.models = new JarModels(p.models, p.blockstates).provider();
  return {
    pack,
    info: { name: p.name, textures: p.names.length, hasModels, hasLanguage: !!p.lang, warnings: p.warnings },
  };
}

function activate(p: ProcessedPack, built: { pack: UserPack; info: PackInfo }): PackInfo {
  setLanguageNames(p.lang ? parseLanguageFile(p.lang) : null);
  clearModelCache();
  setActivePack(built.pack);
  return built.info;
}

/** Processes, stores and activates a user pack. */
export async function installPack(file: File): Promise<PackInfo> {
  const processed = await processPackFile(file);
  const built = await buildPack(processed);
  await db.put('packs', STORE_KEY, processed);
  restored = true;
  currentInfo = activate(processed, built);
  return currentInfo;
}

let restored = false;

/** Re-activates the pack saved on this device, if any. */
export async function restorePack(): Promise<PackInfo | null> {
  if (restored) return currentInfo;
  restored = true;
  const saved = await db.get<ProcessedPack>('packs', STORE_KEY);
  if (!saved) return null;
  try {
    const built = await buildPack(saved);
    currentInfo = activate(saved, built);
    return currentInfo;
  } catch {
    return null;
  }
}

let currentInfo: PackInfo | null = null;

export function getPackInfo(): PackInfo | null {
  return currentInfo;
}

/** Removes the user pack and returns to the bundled textures. */
export async function removePack(): Promise<void> {
  await db.delete('packs', STORE_KEY);
  currentInfo = null;
  setLanguageNames(null);
  clearModelCache();
  setActivePack(null);
}

export type { TexturePack };
