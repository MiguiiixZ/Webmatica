/**
 * Bit-packed array helpers.
 *
 * Litematica stores block state indices in a long array where each entry uses
 * `bits` bits and entries may straddle two longs. Because the long array is
 * kept as little-endian 32-bit words (see NbtLongArray), the whole thing is a
 * contiguous little-endian bit stream, and any entry of up to 32 bits spans at
 * most two consecutive words. No BigInt is needed.
 */

/** Bits per entry used by Litematica for a palette of the given size. */
export function litematicaBits(paletteSize: number): number {
  if (paletteSize <= 1) return 2;
  return Math.max(2, 32 - Math.clz32(paletteSize - 1));
}

/** Number of 32-bit words needed to hold `count` entries of `bits` bits (rounded up to whole longs). */
export function packedWordCount(count: number, bits: number): number {
  return Math.ceil((count * bits) / 64) * 2;
}

/**
 * Calls `fn(index, value)` for each of `count` packed entries. Written as a
 * single tight loop with incremental word/offset tracking (no multiplications
 * that could overflow 2^32 for very large volumes).
 */
export function forEachPacked(
  words: Uint32Array,
  bits: number,
  count: number,
  fn: (index: number, value: number) => void,
): void {
  if (bits < 1 || bits > 32) throw new RangeError(`Invalid bits per entry: ${bits}`);
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  let wi = 0;
  let off = 0;
  const last = words.length - 1;
  for (let i = 0; i < count; i++) {
    let v = words[wi] >>> off;
    const end = off + bits;
    if (end > 32 && wi < last) v |= words[wi + 1] << (32 - off);
    fn(i, (v & mask) >>> 0);
    off = end;
    if (off >= 32) {
      off -= 32;
      wi++;
    }
  }
}

/** Unpacks into an output array (convenience for tests and small arrays). */
export function unpack(words: Uint32Array, bits: number, count: number): Uint32Array {
  const out = new Uint32Array(count);
  forEachPacked(words, bits, count, (i, v) => {
    out[i] = v;
  });
  return out;
}

/** Packs values into Litematica's spanning layout. Used by tests and the example generator. */
export function pack(values: ArrayLike<number>, bits: number): Uint32Array {
  const words = new Uint32Array(packedWordCount(values.length, bits));
  let wi = 0;
  let off = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] >>> 0;
    words[wi] |= v << off;
    if (off + bits > 32) words[wi + 1] |= v >>> (32 - off);
    off += bits;
    if (off >= 32) {
      off -= 32;
      wi++;
    }
  }
  return words;
}

/** Reads Sponge-style unsigned LEB128 varints from a byte array. */
export function forEachVarint(bytes: Int8Array | Uint8Array, count: number, fn: (index: number, value: number) => void): number {
  let pos = 0;
  const len = bytes.length;
  for (let i = 0; i < count; i++) {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (pos >= len) return i;
      const b = bytes[pos++] & 0xff;
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new RangeError('Varint too long');
    }
    fn(i, value >>> 0);
  }
  return count;
}
