/**
 * User texture packs (client.jar and resource packs .zip), stacked like in the
 * game: the pack on top wins, anything it does not contain comes from the packs
 * below it, and finally from the bundled default textures. Packs are processed
 * in a worker and stored in IndexedDB on this device only.
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
  /** True for a full game jar imported before chest textures were extracted (re-import to get them). */
  outdated: boolean;
}

/** IndexedDB keys: the ordered stack (bottom first). "active" is the old single-pack key. */
const STACK_KEY = 'stack';
const LEGACY_KEY = 'active';
/** Lightweight list of pack names (bottom first) so the start screen does not load the packs. */
export const NAMES_KEY = 'stackNames';
const MAX_TILE = 64;

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
  if (from === to) return px.slice();
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

function infoOf(p: ProcessedPack): PackInfo {
  return {
    name: p.name,
    textures: p.names.length,
    hasModels: Object.keys(p.blockstates).length > 50 && Object.keys(p.models).length > 50,
    hasLanguage: !!p.lang,
    warnings: p.warnings,
    outdated: p.names.length > 500 && Object.keys(p.blockstates).length > 500 && !p.names.includes('chest_normal_front'),
  };
}

/** Combines a stack of packs (bottom first) with the bundled textures as the last fallback. */
async function buildStack(stack: ProcessedPack[]): Promise<UserPack> {
  const fallback = await loadDefaultPack().catch(() => null);
  const T = Math.min(MAX_TILE, Math.max(16, ...stack.map((p) => p.tile)));
  const layers = stack
    .slice()
    .reverse()
    .map((p) => ({ p, index: new Map(p.names.map((n, i) => [n, i])) }));
  const own = (n: string): { px: Uint8ClampedArray; tile: number } | null => {
    for (const { p, index } of layers) {
      const i = index.get(n);
      if (i !== undefined) {
        const size = p.tile * p.tile * 4;
        return { px: new Uint8ClampedArray(p.pixels.buffer, p.pixels.byteOffset + i * size, size), tile: p.tile };
      }
    }
    return null;
  };
  const colors = new Map<string, Rgba>();
  const pack: UserPack = {
    id: `user:${stack.map((p) => p.name).join('+')}`,
    name: stack.map((p) => p.name).join(' + '),
    tileSize: T,
    has: (n) => own(n) !== null || !!fallback?.has(n),
    color: (n) => {
      let c = colors.get(n);
      if (c === undefined) {
        const o = own(n);
        c = o ? averageColor(o.px, n) : (fallback?.color(n) ?? 0);
        colors.set(n, c);
      }
      return c || undefined;
    },
    pixels: (n) => {
      const o = own(n);
      if (o) return resample(o.px, o.tile, T);
      const f = fallback?.pixels(n);
      return f ? resample(f, fallback!.tileSize, T) : null;
    },
  };
  // Models and blockstates: higher packs override lower ones file by file.
  const models: Record<string, unknown> = {};
  const blockstates: Record<string, unknown> = {};
  for (const p of stack) {
    Object.assign(models, p.models);
    Object.assign(blockstates, p.blockstates);
  }
  if (Object.keys(blockstates).length > 50 && Object.keys(models).length > 50) {
    pack.models = new JarModels(models, blockstates).provider();
  }
  return pack;
}

let stack: ProcessedPack[] = [];
let restored = false;

async function apply(): Promise<void> {
  if (stack.length === 0) {
    setLanguageNames(null);
    clearModelCache();
    setActivePack(null);
    return;
  }
  const built = await buildStack(stack);
  const lang = stack.slice().reverse().find((p) => p.lang)?.lang ?? null;
  setLanguageNames(lang ? parseLanguageFile(lang) : null);
  clearModelCache();
  setActivePack(built);
}

async function persist(): Promise<void> {
  await db.put('packs', STACK_KEY, stack);
  await db.put('packs', NAMES_KEY, stack.map((p) => p.name));
}

/** Loads the stack saved on this device (once). */
export async function restorePack(): Promise<PackInfo[]> {
  if (restored) return getPackInfos();
  restored = true;
  let saved = await db.get<ProcessedPack[]>('packs', STACK_KEY);
  if (!saved) {
    const legacy = await db.get<ProcessedPack>('packs', LEGACY_KEY);
    if (legacy) {
      saved = [legacy];
      await db.put('packs', STACK_KEY, saved);
      await db.put('packs', NAMES_KEY, [legacy.name]);
      await db.delete('packs', LEGACY_KEY);
    }
  }
  stack = Array.isArray(saved) ? saved : [];
  try {
    await apply();
  } catch {
    // The viewer falls back to the bundled textures if the stack cannot be used.
  }
  return getPackInfos();
}

/** Packs from top to bottom (as shown to the user). */
export function getPackInfos(): PackInfo[] {
  return stack.map(infoOf).reverse();
}

/** Adds a pack on top of the stack. */
export async function addPack(file: File): Promise<PackInfo[]> {
  await restorePack();
  const processed = await processPackFile(file);
  stack.push(processed);
  await persist();
  await apply();
  return getPackInfos();
}

/** Removes a pack; `topIndex` counts from the top of the stack. */
export async function removePackAt(topIndex: number): Promise<PackInfo[]> {
  stack.splice(stack.length - 1 - topIndex, 1);
  await persist();
  await apply();
  return getPackInfos();
}

/** Moves a pack up (towards the top, delta -1) or down (+1); `topIndex` counts from the top. */
export async function movePack(topIndex: number, delta: -1 | 1): Promise<PackInfo[]> {
  const from = stack.length - 1 - topIndex;
  const to = from - delta;
  if (to < 0 || to >= stack.length) return getPackInfos();
  [stack[from], stack[to]] = [stack[to], stack[from]];
  await persist();
  await apply();
  return getPackInfos();
}

export async function removeAllPacks(): Promise<void> {
  stack = [];
  await db.delete('packs', STACK_KEY);
  await db.delete('packs', NAMES_KEY);
  await apply();
}

export type { TexturePack };
