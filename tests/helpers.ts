import { gzipSync } from 'node:zlib';
import { tag, TagType, writeNbt, type Tagged } from '../src/parser/nbt';
import type { BlockState, Vec3 } from '../src/parser/types';

/**
 * Reference implementation of Litematica's LitematicaBitArray.setAt using
 * BigInt, independent from the production code. Returns 32-bit words in the
 * same layout as NbtLongArray.
 */
export function referencePack(values: number[], bits: number): Uint32Array {
  const longCount = Math.ceil((values.length * bits) / 64);
  const longs = new Array<bigint>(longCount).fill(0n);
  const mask = (1n << BigInt(bits)) - 1n;
  const M64 = (1n << 64n) - 1n;
  values.forEach((value, index) => {
    const v = BigInt(value) & mask;
    const startOffset = index * bits;
    const startArr = startOffset >> 6;
    const endArr = ((index + 1) * bits - 1) >> 6;
    const startBit = BigInt(startOffset & 63);
    longs[startArr] = ((longs[startArr] & ~((mask << startBit) & M64)) | ((v << startBit) & M64)) & M64;
    if (startArr !== endArr) {
      const endOffset = 64n - startBit;
      const j1 = BigInt(bits) - endOffset;
      longs[endArr] = ((longs[endArr] >> j1) << j1) | (v >> endOffset);
    }
  });
  const words = new Uint32Array(longCount * 2);
  longs.forEach((l, i) => {
    words[2 * i] = Number(l & 0xffffffffn);
    words[2 * i + 1] = Number((l >> 32n) & 0xffffffffn);
  });
  return words;
}

/** Reference getAt, also BigInt based. */
export function referenceGet(words: Uint32Array, bits: number, index: number): number {
  const long = (i: number) => (BigInt(words[2 * i + 1]) << 32n) | BigInt(words[2 * i]);
  const mask = (1n << BigInt(bits)) - 1n;
  const startOffset = index * bits;
  const startArr = startOffset >> 6;
  const endArr = ((index + 1) * bits - 1) >> 6;
  const startBit = BigInt(startOffset & 63);
  if (startArr === endArr) return Number((long(startArr) >> startBit) & mask);
  const endOffset = 64n - startBit;
  return Number(((long(startArr) >> startBit) | (long(endArr) << endOffset)) & mask);
}

export function bitsFor(paletteSize: number): number {
  return Math.max(2, Math.ceil(Math.log2(Math.max(1, paletteSize))));
}

function stateTag(s: BlockState): Tagged {
  const c: Record<string, Tagged> = { Name: tag.string(s.name) };
  const keys = Object.keys(s.props);
  if (keys.length) {
    const props: Record<string, Tagged> = {};
    for (const k of keys) props[k] = tag.string(s.props[k]);
    c.Properties = tag.compound(props);
  }
  return tag.compound(c);
}

const vecTag = (v: Vec3) => tag.compound({ x: tag.int(v[0]), y: tag.int(v[1]), z: tag.int(v[2]) });

export interface TestRegion {
  name: string;
  pos: Vec3;
  /** Size as stored in the file (may be negative). */
  size: Vec3;
  palette: BlockState[];
  /** Palette indices in Litematica order: index = (y * absZ + z) * absX + x. */
  indices: number[];
  tileEntities?: number;
}

export function makeLitematic(opts: {
  version?: number;
  dataVersion?: number | null;
  name?: string;
  author?: string;
  regions: TestRegion[];
  gzip?: boolean;
}): Uint8Array {
  const regions: Record<string, Tagged> = {};
  let totalBlocks = 0;
  for (const r of opts.regions) {
    const bits = bitsFor(r.palette.length);
    totalBlocks += r.indices.filter((i) => r.palette[i]?.name !== 'minecraft:air').length;
    regions[r.name] = tag.compound({
      Position: vecTag(r.pos),
      Size: vecTag(r.size),
      BlockStatePalette: tag.list(TagType.Compound, r.palette.map(stateTag)),
      BlockStates: tag.longArray(referencePack(r.indices, bits)),
      TileEntities: tag.list(
        TagType.Compound,
        Array.from({ length: r.tileEntities ?? 0 }, (_, i) => tag.compound({ x: tag.int(i), y: tag.int(0), z: tag.int(0), id: tag.string('minecraft:chest') })),
      ),
      Entities: tag.list(TagType.Compound, []),
      PendingBlockTicks: tag.list(TagType.Compound, []),
      PendingFluidTicks: tag.list(TagType.Compound, []),
    });
  }
  const root: Record<string, Tagged> = {
    Version: tag.int(opts.version ?? 6),
    Metadata: tag.compound({
      Name: tag.string(opts.name ?? 'Test'),
      Author: tag.string(opts.author ?? 'Tester'),
      Description: tag.string(''),
      RegionCount: tag.int(opts.regions.length),
      TotalBlocks: tag.int(totalBlocks),
      TotalVolume: tag.int(0),
      TimeCreated: tag.long(1700000000000),
      TimeModified: tag.long(1700000000000),
      EnclosingSize: vecTag([0, 0, 0]),
    }),
    Regions: tag.compound(regions),
  };
  if (opts.dataVersion !== null) root.MinecraftDataVersion = tag.int(opts.dataVersion ?? 3465);
  const raw = writeNbt(tag.compound(root));
  return opts.gzip === false ? raw : new Uint8Array(gzipSync(raw));
}

/** Deterministic pseudo random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const S = (name: string, props: Record<string, string> = {}): BlockState => ({
  name: name.includes(':') ? name : `minecraft:${name}`,
  props,
});
