import type { Schematic, SchematicData } from '../parser/types';
import { BlockVolume } from '../parser/volume';
import ParseWorker from '../workers/parse.worker.ts?worker';

let nextId = 1;

/** Parses a schematic file in a worker so the UI never blocks. */
export function parseInWorker(bytes: Uint8Array, name: string): Promise<{ schematic: Schematic; ms: number }> {
  return new Promise((resolve, reject) => {
    const worker = new ParseWorker();
    const id = nextId++;
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; data?: SchematicData; message?: string; ms?: number }>) => {
      if (e.data.id !== id) return;
      worker.terminate();
      if (!e.data.ok || !e.data.data) {
        reject(new Error(e.data.message ?? 'Unknown error'));
        return;
      }
      resolve({ schematic: hydrate(e.data.data), ms: e.data.ms ?? 0 });
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The file could not be read.'));
    };
    // Send a copy: the original bytes are kept for local storage.
    const copy = bytes.slice();
    worker.postMessage({ id, bytes: copy, name }, [copy.buffer]);
  });
}

export function hydrate(data: SchematicData): Schematic {
  return { ...data, regions: data.regions.map((r) => ({ ...r, volume: new BlockVolume(r.volume) })) };
}

/** Rough Minecraft release name for a data version (for display only). */
export function minecraftVersion(dataVersion: number): string | null {
  if (dataVersion < 0) return null;
  const table: [number, string][] = [
    [4671, '1.21.11'], [4556, '1.21.10'], [4554, '1.21.9'], [4440, '1.21.8'], [4438, '1.21.7'], [4435, '1.21.6'],
    [4325, '1.21.5'], [4189, '1.21.4'], [4082, '1.21.3'], [4080, '1.21.2'], [3955, '1.21.1'], [3953, '1.21'],
    [3839, '1.20.6'], [3837, '1.20.5'], [3700, '1.20.4'], [3698, '1.20.3'], [3578, '1.20.2'], [3465, '1.20.1'],
    [3463, '1.20'], [3337, '1.19.4'], [3218, '1.19.3'], [3120, '1.19.2'], [3117, '1.19.1'], [3105, '1.19'],
    [2975, '1.18.2'], [2865, '1.18.1'], [2860, '1.18'], [2730, '1.17.1'], [2724, '1.17'], [2586, '1.16.5'],
    [2584, '1.16.4'], [2580, '1.16.3'], [2578, '1.16.2'], [2567, '1.16.1'], [2566, '1.16'], [2230, '1.15.2'],
    [2227, '1.15.1'], [2225, '1.15'], [1976, '1.14.4'], [1968, '1.14.3'], [1963, '1.14.2'], [1957, '1.14.1'],
    [1952, '1.14'], [1631, '1.13.2'], [1628, '1.13.1'], [1519, '1.13'], [1343, '1.12.2'], [1241, '1.12.1'], [1139, '1.12'],
  ];
  for (const [dv, name] of table) if (dataVersion >= dv) return dataVersion === dv ? name : `${name}+`;
  return '1.11 or older';
}
