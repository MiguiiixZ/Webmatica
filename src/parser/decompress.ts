/**
 * Decompression helpers. Uses the native DecompressionStream when available
 * (Chrome 80+, Firefox 113+, Safari 16.4+) and falls back to pako, which is
 * loaded lazily so it costs nothing when the native API exists.
 */

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function isZlib(bytes: Uint8Array): boolean {
  // CMF/FLG header check: deflate method, header checksum divisible by 31.
  return bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && ((bytes[0] << 8) | bytes[1]) % 31 === 0;
}

type Format = 'gzip' | 'deflate' | 'deflate-raw';

async function nativeDecompress(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
  const ds = new DecompressionStream(format as CompressionFormat);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function pakoDecompress(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
  const pako = await import('pako');
  return format === 'deflate-raw' ? pako.inflateRaw(bytes) : pako.inflate(bytes);
}

function hasNative(format: Format): boolean {
  if (typeof DecompressionStream === 'undefined') return false;
  try {
    new DecompressionStream(format as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

export async function decompress(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
  if (hasNative(format)) {
    try {
      return await nativeDecompress(bytes, format);
    } catch (e) {
      // Some engines reject trailing garbage that pako tolerates; retry with pako.
      try {
        return await pakoDecompress(bytes, format);
      } catch {
        throw e;
      }
    }
  }
  return pakoDecompress(bytes, format);
}

/** Returns the uncompressed bytes of a possibly gzip/zlib-compressed NBT file. */
export async function maybeDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (isGzip(bytes)) return decompress(bytes, 'gzip');
  if (bytes[0] !== 10 && isZlib(bytes)) return decompress(bytes, 'deflate');
  return bytes;
}
