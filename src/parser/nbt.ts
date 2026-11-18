/**
 * Minimal, fast NBT (Named Binary Tag) reader and writer.
 *
 * The reader returns plain JavaScript values:
 * - Byte, Short, Int, Float, Double -> number
 * - Long -> NbtLong (two 32-bit halves, no BigInt)
 * - ByteArray -> Int8Array, IntArray -> Int32Array
 * - LongArray -> NbtLongArray (packed 32-bit words, little-endian word order)
 * - String -> string, List -> array, Compound -> object
 *
 * The writer takes explicitly tagged values (see `tag` helpers) so that the
 * exact tag types are preserved. It is used by tests and by the example
 * schematic generator.
 */

export enum TagType {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  Long = 4,
  Float = 5,
  Double = 6,
  ByteArray = 7,
  String = 8,
  List = 9,
  Compound = 10,
  IntArray = 11,
  LongArray = 12,
}

/** A 64-bit integer stored as two unsigned 32-bit halves. */
export class NbtLong {
  constructor(
    public readonly hi: number,
    public readonly lo: number,
  ) {}

  /** Converts to a JS number. Exact for |value| < 2^53. */
  toNumber(): number {
    return (this.hi | 0) * 4294967296 + (this.lo >>> 0);
  }
}

/**
 * A long array stored as 32-bit words. Long `i` occupies words `2i` (low half)
 * and `2i + 1` (high half), so the bit stream is contiguous across words:
 * bit `b` of the whole array lives in word `b >>> 5` at offset `b & 31`.
 */
export class NbtLongArray {
  constructor(public readonly words: Uint32Array) {}

  get length(): number {
    return this.words.length >>> 1;
  }
}

export type NbtValue =
  | number
  | string
  | NbtLong
  | NbtLongArray
  | Int8Array
  | Int32Array
  | NbtValue[]
  | NbtCompound;

export interface NbtCompound {
  [key: string]: NbtValue;
}

export class NbtError extends Error {}

const utf8 = new TextDecoder('utf-8');

/** Reads an uncompressed NBT document. Returns the root compound. */
export function readNbt(bytes: Uint8Array, littleEndian = false): { name: string; value: NbtCompound } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const le = littleEndian;

  const need = (n: number) => {
    if (pos + n > bytes.byteLength) throw new NbtError('Unexpected end of NBT data');
  };
  const u8 = () => {
    need(1);
    return bytes[pos++];
  };
  const i16 = () => {
    need(2);
    const v = view.getInt16(pos, le);
    pos += 2;
    return v;
  };
  const u16 = () => {
    need(2);
    const v = view.getUint16(pos, le);
    pos += 2;
    return v;
  };
  const i32 = () => {
    need(4);
    const v = view.getInt32(pos, le);
    pos += 4;
    return v;
  };
  const str = () => {
    const len = u16();
    need(len);
    const s = utf8.decode(bytes.subarray(pos, pos + len));
    pos += len;
    return s;
  };
  const arrayLength = (elemSize: number) => {
    const len = i32();
    if (len < 0) throw new NbtError('Negative array length in NBT data');
    need(len * elemSize);
    return len;
  };

  const readPayload = (type: number, depth: number): NbtValue => {
    if (depth > 512) throw new NbtError('NBT nesting too deep');
    switch (type) {
      case TagType.Byte: {
        need(1);
        return view.getInt8(pos++);
      }
      case TagType.Short:
        return i16();
      case TagType.Int:
        return i32();
      case TagType.Long: {
        need(8);
        const a = view.getUint32(pos, le);
        const b = view.getUint32(pos + 4, le);
        pos += 8;
        return le ? new NbtLong(b, a) : new NbtLong(a, b);
      }
      case TagType.Float: {
        need(4);
        const v = view.getFloat32(pos, le);
        pos += 4;
        return v;
      }
      case TagType.Double: {
        need(8);
        const v = view.getFloat64(pos, le);
        pos += 8;
        return v;
      }
      case TagType.ByteArray: {
        const len = arrayLength(1);
        const arr = new Int8Array(len);
        arr.set(new Int8Array(bytes.buffer, bytes.byteOffset + pos, len));
        pos += len;
        return arr;
      }
      case TagType.String:
        return str();
      case TagType.List: {
        const elemType = u8();
        const len = i32();
        if (len < 0) throw new NbtError('Negative list length in NBT data');
        if (elemType === TagType.End && len > 0) throw new NbtError('Invalid NBT list type');
        const list: NbtValue[] = new Array(len);
        for (let i = 0; i < len; i++) list[i] = readPayload(elemType, depth + 1);
        return list;
      }
      case TagType.Compound: {
        const obj: NbtCompound = {};
        for (;;) {
          const t = u8();
          if (t === TagType.End) break;
          const name = str();
          obj[name] = readPayload(t, depth + 1);
        }
        return obj;
      }
      case TagType.IntArray: {
        const len = arrayLength(4);
        const arr = new Int32Array(len);
        for (let i = 0; i < len; i++) arr[i] = view.getInt32(pos + i * 4, le);
        pos += len * 4;
        return arr;
      }
      case TagType.LongArray: {
        const len = arrayLength(8);
        const words = new Uint32Array(len * 2);
        // Big-endian longs: high word first. Store low word first.
        for (let i = 0, p = pos; i < len; i++, p += 8) {
          const a = view.getUint32(p, le);
          const b = view.getUint32(p + 4, le);
          if (le) {
            words[2 * i] = a;
            words[2 * i + 1] = b;
          } else {
            words[2 * i] = b;
            words[2 * i + 1] = a;
          }
        }
        pos += len * 8;
        return new NbtLongArray(words);
      }
      default:
        throw new NbtError(`Unknown NBT tag type ${type}`);
    }
  };

  const rootType = u8();
  if (rootType !== TagType.Compound) throw new NbtError('NBT root is not a compound tag');
  const name = str();
  const value = readPayload(TagType.Compound, 0) as NbtCompound;
  return { name, value };
}

// ---------------------------------------------------------------------------
// Typed accessors (tolerant of missing or mistyped fields)
// ---------------------------------------------------------------------------

export function isCompound(v: NbtValue | undefined): v is NbtCompound {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof NbtLong) &&
    !(v instanceof NbtLongArray) &&
    !ArrayBuffer.isView(v)
  );
}

export function getCompound(obj: NbtCompound, key: string): NbtCompound | undefined {
  const v = obj[key];
  return isCompound(v) ? v : undefined;
}

export function getNumber(obj: NbtCompound | undefined, key: string, fallback = 0): number {
  if (!obj) return fallback;
  const v = obj[key];
  if (typeof v === 'number') return v;
  if (v instanceof NbtLong) return v.toNumber();
  return fallback;
}

export function getString(obj: NbtCompound | undefined, key: string, fallback = ''): string {
  if (!obj) return fallback;
  const v = obj[key];
  return typeof v === 'string' ? v : fallback;
}

export function getList(obj: NbtCompound | undefined, key: string): NbtValue[] {
  if (!obj) return [];
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export type Tagged =
  | { t: TagType.Byte | TagType.Short | TagType.Int | TagType.Float | TagType.Double; v: number }
  | { t: TagType.Long; v: NbtLong }
  | { t: TagType.String; v: string }
  | { t: TagType.ByteArray; v: Int8Array }
  | { t: TagType.IntArray; v: Int32Array }
  | { t: TagType.LongArray; v: NbtLongArray }
  | { t: TagType.List; elem: TagType; v: Tagged[] }
  | { t: TagType.Compound; v: Record<string, Tagged> };

/** Helpers to build tagged values for the writer. */
export const tag = {
  byte: (v: number): Tagged => ({ t: TagType.Byte, v }),
  short: (v: number): Tagged => ({ t: TagType.Short, v }),
  int: (v: number): Tagged => ({ t: TagType.Int, v }),
  long: (v: number): Tagged => ({
    t: TagType.Long,
    v: new NbtLong(Math.floor(v / 4294967296) >>> 0, v >>> 0),
  }),
  float: (v: number): Tagged => ({ t: TagType.Float, v }),
  double: (v: number): Tagged => ({ t: TagType.Double, v }),
  string: (v: string): Tagged => ({ t: TagType.String, v }),
  byteArray: (v: Int8Array): Tagged => ({ t: TagType.ByteArray, v }),
  intArray: (v: Int32Array): Tagged => ({ t: TagType.IntArray, v }),
  longArray: (words: Uint32Array): Tagged => ({ t: TagType.LongArray, v: new NbtLongArray(words) }),
  list: (elem: TagType, v: Tagged[]): Tagged => ({ t: TagType.List, elem, v }),
  compound: (v: Record<string, Tagged>): Tagged => ({ t: TagType.Compound, v }),
};

const utf8Enc = new TextEncoder();

/** Serializes a tagged compound to uncompressed big-endian NBT. */
export function writeNbt(root: Tagged, rootName = ''): Uint8Array {
  if (root.t !== TagType.Compound) throw new NbtError('Root must be a compound');
  let buf = new Uint8Array(1024);
  let view = new DataView(buf.buffer);
  let pos = 0;
  const ensure = (n: number) => {
    if (pos + n <= buf.length) return;
    let size = buf.length * 2;
    while (size < pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(buf);
    buf = next;
    view = new DataView(buf.buffer);
  };
  const u8 = (v: number) => {
    ensure(1);
    buf[pos++] = v & 0xff;
  };
  const i32 = (v: number) => {
    ensure(4);
    view.setInt32(pos, v);
    pos += 4;
  };
  const str = (s: string) => {
    const b = utf8Enc.encode(s);
    ensure(2 + b.length);
    view.setUint16(pos, b.length);
    pos += 2;
    buf.set(b, pos);
    pos += b.length;
  };
  const payload = (x: Tagged) => {
    switch (x.t) {
      case TagType.Byte:
        u8(x.v);
        break;
      case TagType.Short:
        ensure(2);
        view.setInt16(pos, x.v);
        pos += 2;
        break;
      case TagType.Int:
        i32(x.v);
        break;
      case TagType.Long:
        ensure(8);
        view.setUint32(pos, x.v.hi);
        view.setUint32(pos + 4, x.v.lo);
        pos += 8;
        break;
      case TagType.Float:
        ensure(4);
        view.setFloat32(pos, x.v);
        pos += 4;
        break;
      case TagType.Double:
        ensure(8);
        view.setFloat64(pos, x.v);
        pos += 8;
        break;
      case TagType.ByteArray:
        i32(x.v.length);
        ensure(x.v.length);
        buf.set(new Uint8Array(x.v.buffer, x.v.byteOffset, x.v.length), pos);
        pos += x.v.length;
        break;
      case TagType.String:
        str(x.v);
        break;
      case TagType.List:
        u8(x.v.length ? x.elem : TagType.End);
        i32(x.v.length);
        for (const e of x.v) payload(e);
        break;
      case TagType.Compound:
        for (const [k, e] of Object.entries(x.v)) {
          u8(e.t);
          str(k);
          payload(e);
        }
        u8(TagType.End);
        break;
      case TagType.IntArray:
        i32(x.v.length);
        ensure(x.v.length * 4);
        for (let i = 0; i < x.v.length; i++) view.setInt32(pos + i * 4, x.v[i]);
        pos += x.v.length * 4;
        break;
      case TagType.LongArray: {
        const w = x.v.words;
        const n = w.length >>> 1;
        i32(n);
        ensure(n * 8);
        for (let i = 0; i < n; i++) {
          view.setUint32(pos, w[2 * i + 1]);
          view.setUint32(pos + 4, w[2 * i]);
          pos += 8;
        }
        break;
      }
    }
  };
  u8(TagType.Compound);
  str(rootName);
  payload(root);
  return buf.slice(0, pos);
}
