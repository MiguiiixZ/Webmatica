/// <reference lib="webworker" />
import { parseSchematic } from '../parser';
import { SchematicError } from '../parser/types';

export type ParseRequest = { id: number; bytes: Uint8Array; name: string };

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { id, bytes, name } = e.data;
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  try {
    const t0 = performance.now();
    const data = await parseSchematic(bytes, name);
    const transfer: Transferable[] = [data.totalCounts.buffer];
    for (const r of data.regions) {
      // Shared buffers are visible to every thread already; plain buffers are moved.
      if (r.volume.data.buffer instanceof ArrayBuffer) transfer.push(r.volume.data.buffer, r.volume.slots.buffer as ArrayBuffer);
    }
    scope.postMessage({ id, ok: true, data, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    const message = err instanceof SchematicError ? err.message : `Unexpected error while reading the file: ${(err as Error).message}`;
    scope.postMessage({ id, ok: false, message });
  }
};
