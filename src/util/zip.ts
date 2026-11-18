/**
 * Minimal ZIP reader (used for client.jar and resource packs). Supports stored
 * and deflated entries; reads the central directory, so only the requested
 * entries are decompressed.
 */
import { decompress } from '../parser/decompress';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

export class ZipError extends Error {}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find the End Of Central Directory record (signature 0x06054b50) near the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a valid ZIP or JAR file.');
  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  // ZIP64 locator (rare for resource packs, but client.jar could use it in the future).
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && view.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(view.getBigUint64(loc + 8, true));
      count = Number(view.getBigUint64(z64 + 32, true));
      cdOffset = Number(view.getBigUint64(z64 + 48, true));
    }
  }
  const entries: ZipEntry[] = [];
  const dec = new TextDecoder();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError('Corrupted ZIP central directory.');
    const method = view.getUint16(p + 10, true);
    let compressedSize = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let offset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extra field
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = view.getUint16(e, true);
        const len = view.getUint16(e + 2, true);
        if (id === 1) {
          let q = e + 4;
          if (size === 0xffffffff) (size = Number(view.getBigUint64(q, true))), (q += 8);
          if (compressedSize === 0xffffffff) (compressedSize = Number(view.getBigUint64(q, true))), (q += 8);
          if (offset === 0xffffffff) offset = Number(view.getBigUint64(q, true));
        }
        e += 4 + len;
      }
    }
    entries.push({ name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(e.offset, true) !== 0x04034b50) throw new ZipError(`Corrupted ZIP entry: ${e.name}`);
  const nameLen = view.getUint16(e.offset + 26, true);
  const extraLen = view.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method === 8) return decompress(data, 'deflate-raw');
  throw new ZipError(`Unsupported compression method ${e.method} in ${e.name}`);
}
