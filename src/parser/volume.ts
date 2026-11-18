/**
 * Compact chunked block storage.
 *
 * A volume is split into 16x16x16 chunks. Chunks containing only air are not
 * stored at all; the others are stored back to back in one typed array (one
 * entry per block, holding a global palette id, 0 = air). This keeps memory
 * proportional to the non-empty part of a schematic and makes it trivial to
 * hand a whole volume to a worker as two transferable/shareable buffers.
 */

export const CHUNK = 16;
export const CHUNK_VOLUME = CHUNK * CHUNK * CHUNK;

export type BlockArray = Uint8Array | Uint16Array;

export interface BlockVolumeData {
  sx: number;
  sy: number;
  sz: number;
  /** Bytes per entry: 1 (palette <= 256) or 2. */
  bytesPerBlock: 1 | 2;
  /** Concatenated chunk data, CHUNK_VOLUME entries per stored chunk. */
  data: BlockArray;
  /** Slot of each chunk inside `data`, or -1 for an empty (all air) chunk. */
  slots: Int32Array;
}

/** Index of a block inside its chunk. */
export function localIndex(x: number, y: number, z: number): number {
  return ((y & 15) << 8) | ((z & 15) << 4) | (x & 15);
}

export class BlockVolume implements BlockVolumeData {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly bytesPerBlock: 1 | 2;
  data: BlockArray;
  slots: Int32Array;

  constructor(d: BlockVolumeData) {
    this.sx = d.sx;
    this.sy = d.sy;
    this.sz = d.sz;
    this.cx = Math.ceil(d.sx / CHUNK);
    this.cy = Math.ceil(d.sy / CHUNK);
    this.cz = Math.ceil(d.sz / CHUNK);
    this.bytesPerBlock = d.bytesPerBlock;
    this.data = d.data;
    this.slots = d.slots;
  }

  chunkIndex(cx: number, cy: number, cz: number): number {
    return (cy * this.cz + cz) * this.cx + cx;
  }

  /** Returns the palette id at (x, y, z), or 0 when outside the volume. */
  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const slot = this.slots[((y >> 4) * this.cz + (z >> 4)) * this.cx + (x >> 4)];
    if (slot < 0) return 0;
    return this.data[slot * CHUNK_VOLUME + localIndex(x, y, z)];
  }

  /** Returns the stored chunk array or null if the chunk is empty. */
  chunk(cx: number, cy: number, cz: number): BlockArray | null {
    const slot = this.slots[this.chunkIndex(cx, cy, cz)];
    if (slot < 0) return null;
    return this.data.subarray(slot * CHUNK_VOLUME, (slot + 1) * CHUNK_VOLUME) as BlockArray;
  }

  get storedChunks(): number {
    return this.data.length / CHUNK_VOLUME;
  }

  get byteSize(): number {
    return this.data.byteLength + this.slots.byteLength;
  }

  toData(): BlockVolumeData {
    return {
      sx: this.sx,
      sy: this.sy,
      sz: this.sz,
      bytesPerBlock: this.bytesPerBlock,
      data: this.data,
      slots: this.slots,
    };
  }
}

/** Allocates a buffer, shared between threads when the page is cross-origin isolated. */
export function allocBuffer(bytes: number): ArrayBuffer | SharedArrayBuffer {
  const g = globalThis as { crossOriginIsolated?: boolean };
  if (g.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
    return new SharedArrayBuffer(bytes);
  }
  return new ArrayBuffer(bytes);
}

/**
 * Incrementally builds a BlockVolume. Chunks are allocated lazily on the first
 * non-air block written to them.
 */
export class VolumeBuilder {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  private readonly bytesPerBlock: 1 | 2;
  private data: BlockArray;
  private readonly slots: Int32Array;
  private used = 0;

  constructor(sx: number, sy: number, sz: number, bytesPerBlock: 1 | 2) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.cx = Math.ceil(sx / CHUNK);
    this.cy = Math.ceil(sy / CHUNK);
    this.cz = Math.ceil(sz / CHUNK);
    this.bytesPerBlock = bytesPerBlock;
    this.slots = new Int32Array(this.cx * this.cy * this.cz).fill(-1);
    const initial = Math.max(1, Math.min(this.slots.length, 64));
    this.data = this.alloc(initial * CHUNK_VOLUME);
  }

  private alloc(entries: number): BlockArray {
    return this.bytesPerBlock === 1 ? new Uint8Array(entries) : new Uint16Array(entries);
  }

  private slotFor(chunkIdx: number): number {
    let slot = this.slots[chunkIdx];
    if (slot >= 0) return slot;
    slot = this.used++;
    if (this.used * CHUNK_VOLUME > this.data.length) {
      const grown = this.alloc(Math.min(this.slots.length, this.used * 2) * CHUNK_VOLUME);
      grown.set(this.data);
      this.data = grown;
    }
    this.slots[chunkIdx] = slot;
    return slot;
  }

  /** Writes a block. Writing 0 (air) to an empty chunk does not allocate it. */
  set(x: number, y: number, z: number, id: number): void {
    const ci = ((y >> 4) * this.cz + (z >> 4)) * this.cx + (x >> 4);
    if (id === 0) {
      const slot = this.slots[ci];
      if (slot >= 0) this.data[slot * CHUNK_VOLUME + localIndex(x, y, z)] = 0;
      return;
    }
    const slot = this.slotFor(ci);
    this.data[slot * CHUNK_VOLUME + localIndex(x, y, z)] = id;
  }

  get(x: number, y: number, z: number): number {
    const slot = this.slots[((y >> 4) * this.cz + (z >> 4)) * this.cx + (x >> 4)];
    return slot < 0 ? 0 : this.data[slot * CHUNK_VOLUME + localIndex(x, y, z)];
  }

  /** Finalizes the volume into exactly-sized (and possibly shared) buffers. */
  build(): BlockVolume {
    const entries = this.used * CHUNK_VOLUME;
    const buf = allocBuffer(entries * this.bytesPerBlock);
    const data: BlockArray = this.bytesPerBlock === 1 ? new Uint8Array(buf) : new Uint16Array(buf);
    data.set(this.data.subarray(0, entries));
    const slotsBuf = allocBuffer(this.slots.byteLength);
    const slots = new Int32Array(slotsBuf);
    slots.set(this.slots);
    return new BlockVolume({
      sx: this.sx,
      sy: this.sy,
      sz: this.sz,
      bytesPerBlock: this.bytesPerBlock,
      data,
      slots,
    });
  }
}
