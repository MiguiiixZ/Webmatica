import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { litematicaBits, pack, packedWordCount, unpack, forEachVarint } from '../src/parser/bits';
import { parseSchematic } from '../src/parser';
import { NbtLong, NbtLongArray, readNbt, tag, TagType, writeNbt } from '../src/parser/nbt';
import { normalizeRegion } from '../src/parser/litematic';
import { BlockVolume } from '../src/parser/volume';
import { stateKey, type SchematicData } from '../src/parser/types';
import { bitsFor, makeLitematic, referenceGet, referencePack, rng, S, type TestRegion } from './helpers';

function blockAt(data: SchematicData, region: number, x: number, y: number, z: number): string {
  const vol = new BlockVolume(data.regions[region].volume);
  return stateKey(data.palette[vol.get(x, y, z)]);
}

describe('bit packing', () => {
  it('computes Litematica bits per entry', () => {
    const cases: [number, number][] = [
      [1, 2], [2, 2], [3, 2], [4, 2], [5, 3], [8, 3], [9, 4], [16, 4], [17, 5], [256, 8], [257, 9], [4096, 12], [4097, 13], [65536, 16],
    ];
    for (const [size, bits] of cases) {
      expect(litematicaBits(size), `palette ${size}`).toBe(bits);
      expect(bitsFor(size)).toBe(bits);
    }
  });

  it('matches the BigInt reference implementation for every bit width', () => {
    const r = rng(42);
    for (let bits = 1; bits <= 31; bits++) {
      // Lengths chosen so entries straddle long boundaries in different ways.
      for (const count of [1, 2, 3, 7, 63, 64, 65, 129, 1000]) {
        const max = 2 ** bits;
        const values = Array.from({ length: count }, () => Math.floor(r() * max));
        const ref = referencePack(values, bits);
        expect(ref.length).toBe(packedWordCount(count, bits));
        // Our packer produces the exact same words as the reference.
        expect(Array.from(pack(values, bits))).toEqual(Array.from(ref));
        // Our unpacker reads back the reference data.
        expect(Array.from(unpack(ref, bits, count))).toEqual(values);
        // Spot check against the reference reader.
        for (let i = 0; i < count; i += 17) expect(referenceGet(ref, bits, i)).toBe(values[i]);
      }
    }
  });

  it('handles 32-bit entries', () => {
    const values = [0, 1, 0xffffffff, 0x80000000, 123456789];
    expect(Array.from(unpack(pack(values, 32), 32, values.length))).toEqual(values);
  });

  it('decodes Sponge varints', () => {
    const bytes = new Uint8Array([0x00, 0x7f, 0x80, 0x01, 0xff, 0xff, 0x03]);
    const out: number[] = [];
    forEachVarint(bytes, 4, (_, v) => out.push(v));
    expect(out).toEqual([0, 127, 128, 65535]);
  });
});

describe('NBT', () => {
  it('round-trips all tag types', () => {
    const words = new Uint32Array([0xdeadbeef, 0x01234567, 0, 0xffffffff]);
    const bytes = writeNbt(
      tag.compound({
        b: tag.byte(-5),
        s: tag.short(-1234),
        i: tag.int(2147483647),
        l: tag.long(1700000000123),
        f: tag.float(1.5),
        d: tag.double(Math.PI),
        str: tag.string('Grüße ✓'),
        ba: tag.byteArray(new Int8Array([1, -2, 3])),
        ia: tag.intArray(new Int32Array([-1, 2, 3])),
        la: tag.longArray(words),
        list: tag.list(TagType.Int, [tag.int(1), tag.int(2)]),
        empty: tag.list(TagType.Compound, []),
        nested: tag.compound({ x: tag.string('y') }),
      }),
    );
    const { value } = readNbt(bytes);
    expect(value.b).toBe(-5);
    expect(value.s).toBe(-1234);
    expect(value.i).toBe(2147483647);
    expect((value.l as NbtLong).toNumber()).toBe(1700000000123);
    expect(value.f).toBe(1.5);
    expect(value.d).toBe(Math.PI);
    expect(value.str).toBe('Grüße ✓');
    expect(Array.from(value.ba as Int8Array)).toEqual([1, -2, 3]);
    expect(Array.from(value.ia as Int32Array)).toEqual([-1, 2, 3]);
    expect(Array.from((value.la as NbtLongArray).words)).toEqual(Array.from(words));
    expect(value.list).toEqual([1, 2]);
    expect(value.empty).toEqual([]);
    expect(value.nested).toEqual({ x: 'y' });
  });

  it('rejects truncated data', () => {
    const bytes = writeNbt(tag.compound({ a: tag.string('hello') }));
    expect(() => readNbt(bytes.subarray(0, bytes.length - 3))).toThrow();
  });
});

describe('region normalization', () => {
  it('keeps positive sizes', () => {
    expect(normalizeRegion([1, 2, 3], [4, 5, 6])).toEqual({ min: [1, 2, 3], size: [4, 5, 6] });
  });
  it('normalizes negative sizes to the minimum corner', () => {
    expect(normalizeRegion([10, 0, -3], [-5, 2, -4])).toEqual({ min: [6, 0, -6], size: [5, 2, 4] });
  });
});

function cubeRegion(name: string, pos: [number, number, number], size: [number, number, number], palette: ReturnType<typeof S>[], fill: (x: number, y: number, z: number) => number): TestRegion {
  const ax = Math.abs(size[0]);
  const ay = Math.abs(size[1]);
  const az = Math.abs(size[2]);
  const indices: number[] = [];
  for (let y = 0; y < ay; y++) for (let z = 0; z < az; z++) for (let x = 0; x < ax; x++) indices.push(fill(x, y, z));
  return { name, pos, size, palette, indices };
}

describe('litematic parser', () => {
  it('parses a simple v6 schematic with metadata', async () => {
    const palette = [S('air'), S('stone'), S('oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' })];
    const file = makeLitematic({
      version: 6,
      name: 'Tiny',
      author: 'Me',
      regions: [cubeRegion('Main', [0, 0, 0], [3, 2, 2], palette, (x, y) => (y === 0 ? 1 : x === 1 ? 2 : 0))],
    });
    const data = await parseSchematic(file, 'tiny.litematic');
    expect(data.format).toBe('litematic');
    expect(data.meta.name).toBe('Tiny');
    expect(data.meta.author).toBe('Me');
    expect(data.meta.formatVersion).toBe(6);
    expect(data.meta.dataVersion).toBe(3465);
    expect(data.size).toEqual([3, 2, 2]);
    expect(data.regions[0].blockCount).toBe(6 + 2);
    expect(blockAt(data, 0, 0, 0, 0)).toBe('minecraft:stone');
    expect(blockAt(data, 0, 1, 1, 1)).toBe('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]');
    expect(blockAt(data, 0, 0, 1, 0)).toBe('minecraft:air');
    const stoneId = data.palette.findIndex((p) => p.name === 'minecraft:stone');
    expect(data.totalCounts[stoneId]).toBe(6);
    expect(data.warnings).toEqual([]);
  });

  it('parses version 5 files', async () => {
    const file = makeLitematic({ version: 5, dataVersion: 2586, regions: [cubeRegion('R', [0, 0, 0], [2, 2, 2], [S('air'), S('dirt')], () => 1)] });
    const data = await parseSchematic(file);
    expect(data.meta.formatVersion).toBe(5);
    expect(data.regions[0].blockCount).toBe(8);
  });

  it('accepts uncompressed NBT too', async () => {
    const file = makeLitematic({ gzip: false, regions: [cubeRegion('R', [0, 0, 0], [1, 1, 1], [S('air'), S('dirt')], () => 1)] });
    const data = await parseSchematic(file);
    expect(data.regions[0].blockCount).toBe(1);
  });

  it.each([1, 2, 3, 4, 5, 17, 300, 5000])('decodes palettes of size %i', async (paletteSize) => {
    const palette = [S('air')];
    for (let i = 1; i < paletteSize; i++) palette.push(S('stone', { n: String(i) }));
    const r = rng(paletteSize);
    const size: [number, number, number] = [19, 7, 13];
    const expected: number[] = [];
    const region = cubeRegion('R', [0, 0, 0], size, palette, () => {
      const v = Math.floor(r() * paletteSize);
      expected.push(v);
      return v;
    });
    const data = await parseSchematic(makeLitematic({ regions: [region] }));
    const vol = new BlockVolume(data.regions[0].volume);
    expect(vol.bytesPerBlock).toBe(paletteSize <= 256 ? 1 : 2);
    let i = 0;
    let nonAir = 0;
    for (let y = 0; y < size[1]; y++)
      for (let z = 0; z < size[2]; z++)
        for (let x = 0; x < size[0]; x++, i++) {
          const want = palette[expected[i]];
          const got = data.palette[vol.get(x, y, z)];
          expect(stateKey(got)).toBe(stateKey(want));
          if (expected[i] !== 0) nonAir++;
        }
    expect(data.regions[0].blockCount).toBe(nonAir);
  });

  it('handles regions with negative sizes', async () => {
    // Region spans x 6..10, z -6..-3 (size -5 at x=10 and -4 at z=-3).
    const palette = [S('air'), S('stone'), S('gold_block')];
    const region = cubeRegion('Neg', [10, 0, -3], [-5, 2, -4], palette, (x, y, z) => (x === 0 && y === 0 && z === 0 ? 2 : 1));
    const data = await parseSchematic(makeLitematic({ regions: [region] }));
    expect(data.size).toEqual([5, 2, 4]);
    expect(data.regions[0].size).toEqual([5, 2, 4]);
    expect(data.regions[0].offset).toEqual([0, 0, 0]);
    // Data is stored relative to the minimum corner.
    expect(blockAt(data, 0, 0, 0, 0)).toBe('minecraft:gold_block');
    expect(blockAt(data, 0, 4, 1, 3)).toBe('minecraft:stone');
  });

  it('places multiple regions inside the enclosing box and merges palettes', async () => {
    const a = cubeRegion('A', [0, 0, 0], [2, 1, 1], [S('air'), S('stone')], () => 1);
    const b = cubeRegion('B', [5, 3, -2], [-2, 1, 1], [S('air'), S('glass'), S('stone')], (x) => (x === 0 ? 1 : 2));
    const data = await parseSchematic(makeLitematic({ regions: [a, b] }));
    // B covers x 4..5, y 3, z -2. A covers x 0..1, y 0, z 0. Enclosing min (0,0,-2), max (6,4,1).
    expect(data.size).toEqual([6, 4, 3]);
    expect(data.regions.map((r) => r.offset)).toEqual([
      [0, 0, 2],
      [4, 3, 0],
    ]);
    expect(data.palette.map(stateKey)).toEqual(['minecraft:air', 'minecraft:stone', 'minecraft:glass']);
    expect(blockAt(data, 1, 0, 0, 0)).toBe('minecraft:glass');
    expect(blockAt(data, 1, 1, 0, 0)).toBe('minecraft:stone');
    expect(data.totalCounts[1]).toBe(3);
  });

  it('treats cave_air, void_air and structure_void as air', async () => {
    const palette = [S('air'), S('cave_air'), S('void_air'), S('structure_void'), S('stone')];
    const data = await parseSchematic(makeLitematic({ regions: [cubeRegion('R', [0, 0, 0], [5, 1, 1], palette, (x) => x)] }));
    expect(data.regions[0].blockCount).toBe(1);
    expect(data.palette.length).toBe(2);
  });

  it('handles large sparse volumes without allocating empty chunks', async () => {
    const size: [number, number, number] = [100, 64, 100];
    const region = cubeRegion('Big', [0, 0, 0], size, [S('air'), S('stone')], (x, y, z) => (x === 50 && y === 32 && z === 50 ? 1 : 0));
    const data = await parseSchematic(makeLitematic({ regions: [region] }));
    const vol = new BlockVolume(data.regions[0].volume);
    expect(vol.storedChunks).toBe(1);
    expect(vol.get(50, 32, 50)).toBe(1);
    expect(data.regions[0].blockCount).toBe(1);
  });

  it('converts legacy 1.12 block states', async () => {
    const palette = [
      S('air'),
      S('wool', { color: 'silver' }),
      S('planks', { variant: 'spruce' }),
      S('stone_slab', { variant: 'stone_brick', half: 'top' }),
      S('log', { variant: 'birch', axis: 'x' }),
      S('lit_furnace', { facing: 'east' }),
      S('stained_hardened_clay', { color: 'red' }),
      S('double_plant', { variant: 'syringa', half: 'upper', facing: 'north' }),
    ];
    const data = await parseSchematic(
      makeLitematic({ version: 4, dataVersion: 1343, regions: [cubeRegion('R', [0, 0, 0], [8, 1, 1], palette, (x) => x)] }),
    );
    expect(data.meta.convertedFromLegacy).toBe(true);
    expect(data.palette.slice(1).map(stateKey)).toEqual([
      'minecraft:light_gray_wool',
      'minecraft:spruce_planks',
      'minecraft:stone_brick_slab[type=top,waterlogged=false]',
      'minecraft:birch_log[axis=x]',
      'minecraft:furnace[facing=east,lit=true]',
      'minecraft:red_terracotta',
      'minecraft:lilac[half=upper]',
    ]);
  });

  it('detects legacy palettes when the data version is missing', async () => {
    const data = await parseSchematic(
      makeLitematic({ version: 3, dataVersion: null, regions: [cubeRegion('R', [0, 0, 0], [2, 1, 1], [S('air'), S('wool', { color: 'red' })], () => 1)] }),
    );
    expect(data.meta.convertedFromLegacy).toBe(true);
    expect(data.palette[1].name).toBe('minecraft:red_wool');
  });

  it('reports a clear error for corrupted files', async () => {
    const file = makeLitematic({ regions: [cubeRegion('R', [0, 0, 0], [2, 2, 2], [S('air'), S('stone')], () => 1)] });
    await expect(parseSchematic(file.subarray(0, file.length / 2))).rejects.toThrow(/corrupted|could not/i);
    await expect(parseSchematic(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not valid NBT|could not/i);
    await expect(parseSchematic(new Uint8Array())).rejects.toThrow(/empty/);
  });

  it('rejects unknown NBT structures', async () => {
    const file = new Uint8Array(gzipSync(writeNbt(tag.compound({ Foo: tag.int(1) }))));
    await expect(parseSchematic(file)).rejects.toThrow(/Unrecognized schematic format/);
  });

  it('warns about truncated block data instead of crashing', async () => {
    const region = cubeRegion('R', [0, 0, 0], [8, 8, 8], [S('air'), S('stone'), S('dirt')], () => 1);
    const raw = makeLitematic({ gzip: false, regions: [region] });
    const { value } = readNbt(raw);
    const r = (value.Regions as Record<string, Record<string, unknown>>).R;
    const words = (r.BlockStates as NbtLongArray).words;
    // Re-encode with half of the block data removed.
    const truncated = writeNbt(
      tag.compound({
        Version: tag.int(6),
        MinecraftDataVersion: tag.int(3465),
        Metadata: tag.compound({ Name: tag.string('T') }),
        Regions: tag.compound({
          R: tag.compound({
            Position: tag.compound({ x: tag.int(0), y: tag.int(0), z: tag.int(0) }),
            Size: tag.compound({ x: tag.int(8), y: tag.int(8), z: tag.int(8) }),
            BlockStatePalette: tag.list(TagType.Compound, [
              tag.compound({ Name: tag.string('minecraft:air') }),
              tag.compound({ Name: tag.string('minecraft:stone') }),
              tag.compound({ Name: tag.string('minecraft:dirt') }),
            ]),
            BlockStates: tag.longArray(words.slice(0, words.length / 2)),
          }),
        }),
      }),
    );
    const data = await parseSchematic(truncated);
    expect(data.warnings.length).toBeGreaterThan(0);
    expect(data.regions[0].blockCount).toBeGreaterThan(0);
    expect(data.regions[0].blockCount).toBeLessThan(512);
  });
});

describe('other formats', () => {
  it('parses Sponge v2 schematics', async () => {
    // 2x1x2, index = x + z * W + y * W * L
    const bytes = writeNbt(
      tag.compound({
        Version: tag.int(2),
        DataVersion: tag.int(3465),
        Width: tag.short(2),
        Height: tag.short(1),
        Length: tag.short(2),
        PaletteMax: tag.int(3),
        Palette: tag.compound({
          'minecraft:air': tag.int(0),
          'minecraft:stone': tag.int(1),
          'minecraft:oak_log[axis=x]': tag.int(2),
        }),
        BlockData: tag.byteArray(new Int8Array([1, 0, 2, 1])),
        BlockEntities: tag.list(TagType.Compound, []),
      }),
      'Schematic',
    );
    const data = await parseSchematic(new Uint8Array(gzipSync(bytes)), 'test.schem');
    expect(data.format).toBe('sponge');
    expect(data.meta.name).toBe('test');
    expect(blockAt(data, 0, 0, 0, 0)).toBe('minecraft:stone');
    expect(blockAt(data, 0, 1, 0, 0)).toBe('minecraft:air');
    expect(blockAt(data, 0, 0, 0, 1)).toBe('minecraft:oak_log[axis=x]');
    expect(blockAt(data, 0, 1, 0, 1)).toBe('minecraft:stone');
  });

  it('parses Sponge v3 schematics with varints above 127', async () => {
    const palette: Record<string, ReturnType<typeof tag.int>> = { 'minecraft:air': tag.int(0) };
    for (let i = 1; i <= 200; i++) palette[`minecraft:stone[n=${i}]`] = tag.int(i);
    const bytes = writeNbt(
      tag.compound({
        Schematic: tag.compound({
          Version: tag.int(3),
          DataVersion: tag.int(3700),
          Width: tag.short(2),
          Height: tag.short(1),
          Length: tag.short(1),
          Blocks: tag.compound({
            Palette: tag.compound(palette),
            Data: tag.byteArray(new Int8Array([0xc8 - 256, 0x01, 0x05])),
          }),
        }),
      }),
    );
    const data = await parseSchematic(bytes);
    expect(blockAt(data, 0, 0, 0, 0)).toBe('minecraft:stone[n=200]');
    expect(blockAt(data, 0, 1, 0, 0)).toBe('minecraft:stone[n=5]');
  });

  it('parses structure block files', async () => {
    const bytes = writeNbt(
      tag.compound({
        DataVersion: tag.int(3465),
        size: tag.list(TagType.Int, [tag.int(2), tag.int(2), tag.int(1)]),
        palette: tag.list(TagType.Compound, [
          tag.compound({ Name: tag.string('minecraft:glass') }),
          tag.compound({ Name: tag.string('minecraft:chest'), Properties: tag.compound({ facing: tag.string('west') }) }),
        ]),
        blocks: tag.list(TagType.Compound, [
          tag.compound({ pos: tag.list(TagType.Int, [tag.int(0), tag.int(0), tag.int(0)]), state: tag.int(0) }),
          tag.compound({ pos: tag.list(TagType.Int, [tag.int(1), tag.int(1), tag.int(0)]), state: tag.int(1), nbt: tag.compound({ id: tag.string('minecraft:chest') }) }),
        ]),
        entities: tag.list(TagType.Compound, []),
      }),
    );
    const data = await parseSchematic(new Uint8Array(gzipSync(bytes)), 'house.nbt');
    expect(data.format).toBe('structure');
    expect(data.regions[0].blockCount).toBe(2);
    expect(data.regions[0].tileEntityCount).toBe(1);
    expect(blockAt(data, 0, 1, 1, 0)).toBe('minecraft:chest[facing=west]');
  });

  it('parses MCEdit .schematic files with numeric ids', async () => {
    // 3x1x1: white wool (35:0), red wool (35:14), spruce planks (5:1)
    const bytes = writeNbt(
      tag.compound({
        Width: tag.short(3),
        Height: tag.short(1),
        Length: tag.short(1),
        Materials: tag.string('Alpha'),
        Blocks: tag.byteArray(new Int8Array([35, 35, 5])),
        Data: tag.byteArray(new Int8Array([0, 14, 1])),
        TileEntities: tag.list(TagType.Compound, []),
        Entities: tag.list(TagType.Compound, []),
      }),
      'Schematic',
    );
    const data = await parseSchematic(new Uint8Array(gzipSync(bytes)), 'old.schematic');
    expect(data.format).toBe('mcedit');
    expect([0, 1, 2].map((x) => blockAt(data, 0, x, 0, 0))).toEqual([
      'minecraft:white_wool',
      'minecraft:red_wool',
      'minecraft:spruce_planks',
    ]);
  });
});

describe('bundled example', () => {
  it('parses the example cottage', async () => {
    const { readFileSync } = await import('node:fs');
    const bytes = new Uint8Array(readFileSync('public/examples/example-cottage.litematic'));
    const data = await parseSchematic(bytes);
    expect(data.meta.name).toBe('Example Cottage');
    expect(data.size).toEqual([13, 9, 13]);
    expect(data.meta.declaredTotalBlocks).toBe(data.regions[0].blockCount);
    expect(data.warnings).toEqual([]);
  });
});
