import { randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPartialZip } from '../src/render/officialPack';
import { listZip, readEntry } from '../src/util/zip';

/** Minimal zip writer (deflate) for tests. */
function makeZip(files: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name);
    const comp = new Uint8Array(deflateRawSync(data));
    const local = new Uint8Array(30 + n.length + comp.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(comp, 30 + n.length);
    const c = new Uint8Array(46 + n.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    locals.push(local);
    centrals.push(c);
    offset += local.length;
  }
  const cdLen = centrals.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(offset + cdLen + 22);
  let o = 0;
  for (const l of [...locals, ...centrals]) {
    out.set(l, o);
    o += l.length;
  }
  const v = new DataView(out.buffer);
  v.setUint32(o, 0x06054b50, true);
  v.setUint16(o + 8, files.length, true);
  v.setUint16(o + 10, files.length, true);
  v.setUint32(o + 12, cdLen, true);
  v.setUint32(o + 16, offset, true);
  return out;
}

function noise(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n)); // incompressible
}

const text = (s: string) => new TextEncoder().encode(s);

describe('partial download of the client.jar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches only the needed entries with range requests and rebuilds a valid zip', async () => {
    const zip = makeZip([
      ['assets/minecraft/sounds/big.ogg', noise(300_000)],
      ['assets/minecraft/textures/block/stone.png', text('stone-png')],
      ['net/minecraft/Main.class', noise(200_000)],
      ['assets/minecraft/models/block/stone.json', text('{"parent":"block/cube_all"}')],
      ['assets/minecraft/blockstates/stone.json', text('{"variants":{}}')],
      ['assets/minecraft/textures/entity/chest/normal.png', text('chest')],
      ['assets/minecraft/textures/item/apple.png', noise(100_000)],
    ]);
    let requested = 0;
    vi.stubGlobal('fetch', async (_url: string, init: { headers: { Range: string } }) => {
      const m = /bytes=(\d+)-(\d+)/.exec(init.headers.Range)!;
      const [a, b] = [Number(m[1]), Number(m[2]) + 1];
      requested += b - a;
      return new Response(zip.slice(a, b), { status: 206 });
    });
    const out = await downloadPartialZip('https://example.test/client.jar', zip.length);
    expect(out).not.toBeNull();
    expect(requested).toBeLessThan(zip.length / 4);
    const entries = listZip(out!);
    expect(entries.map((e) => e.name).sort()).toEqual([
      'assets/minecraft/blockstates/stone.json',
      'assets/minecraft/models/block/stone.json',
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/textures/entity/chest/normal.png',
    ]);
    const dec = new TextDecoder();
    const get = async (n: string) => dec.decode(await readEntry(out!, entries.find((e) => e.name === n)!));
    expect(await get('assets/minecraft/textures/block/stone.png')).toBe('stone-png');
    expect(await get('assets/minecraft/models/block/stone.json')).toBe('{"parent":"block/cube_all"}');
  });

  it('returns null when the server ignores ranges', async () => {
    const zip = makeZip([['assets/minecraft/blockstates/a.json', text('{}')]]);
    vi.stubGlobal('fetch', async () => new Response(zip, { status: 200 }));
    expect(await downloadPartialZip('https://example.test/client.jar', zip.length)).toBeNull();
  });
});
