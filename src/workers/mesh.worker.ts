/// <reference lib="webworker" />
import { BlockVolume } from '../parser/volume';
import { Mesher } from '../render/mesher';
import type { MeshRequest, MeshResponse } from './meshProtocol';

let mesher: Mesher | null = null;

self.onmessage = (e: MessageEvent<MeshRequest>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      mesher = new Mesher(
        msg.regions.map((r) => ({ offset: r.offset, volume: new BlockVolume(r.volume) })),
        msg.tables,
      );
      mesher.ao = msg.ao;
      break;
    case 'tables':
      mesher?.setTables(msg.tables);
      break;
    case 'options':
      if (mesher) mesher.ao = msg.ao;
      break;
    case 'reset':
      mesher = null;
      break;
    case 'mesh': {
      if (!mesher) {
        post({ type: 'error', id: msg.id, message: 'Mesher not initialized' });
        return;
      }
      const t0 = performance.now();
      try {
        const out = mesher.mesh(msg.cx, msg.cy, msg.cz, msg.visible, msg.clip);
        post({ type: 'meshed', id: msg.id, solid: out.solid, translucent: out.translucent, ms: performance.now() - t0 }, [
          out.solid.buffer,
          out.translucent.buffer,
        ]);
      } catch (err) {
        post({ type: 'error', id: msg.id, message: (err as Error).message });
      }
      break;
    }
  }
};

function post(m: MeshResponse, transfer: Transferable[] = []): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);
}
