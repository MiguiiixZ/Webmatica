/**
 * Downloads the official Minecraft: Java Edition client.jar straight from Mojang's
 * servers into the user's browser (the same files the official launcher downloads).
 * Webmatica never hosts, proxies or redistributes Minecraft files: the jar goes from
 * Mojang to this browser, is processed locally, and only the extracted textures,
 * models and names are kept in this device's IndexedDB.
 */

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export interface McVersion {
  id: string;
  url: string;
  releaseTime: string;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

let manifestCache: Promise<{ latest: string; releases: McVersion[] }> | null = null;

/** Release versions from 1.14 up (the block texture/model layout Webmatica understands), newest first. */
export function getReleases(): Promise<{ latest: string; releases: McVersion[] }> {
  manifestCache ??= (async () => {
    const r = await fetch(MANIFEST_URL, { mode: 'cors' });
    if (!r.ok) throw new Error(`Mojang version list: HTTP ${r.status}`);
    const m = (await r.json()) as { latest: { release: string }; versions: (McVersion & { type: string })[] };
    const cutoff = m.versions.find((v) => v.id === '1.14')?.releaseTime ?? '2019-04-23';
    const releases = m.versions.filter((v) => v.type === 'release' && v.releaseTime >= cutoff).map(({ id, url, releaseTime }) => ({ id, url, releaseTime }));
    return { latest: m.latest.release, releases };
  })();
  manifestCache.catch(() => (manifestCache = null));
  return manifestCache;
}

async function sha1Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Jar folders Webmatica uses (see pack.worker.ts). Everything else (sounds, code...) is never downloaded. */
const WANTED = [
  'assets/minecraft/textures/block/',
  'assets/minecraft/models/block/',
  'assets/minecraft/blockstates/',
  'assets/minecraft/textures/entity/chest/',
];

async function fetchRange(url: string, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array | 'full'> {
  const r = await fetch(url, { mode: 'cors', headers: { Range: `bytes=${start}-${end - 1}` }, signal });
  if (r.status === 200) return 'full'; // server ignored the range
  if (r.status !== 206) throw new Error(`Mojang download: HTTP ${r.status}`);
  const b = new Uint8Array(await r.arrayBuffer());
  if (b.length !== end - start) throw new Error('Mojang download: unexpected range size');
  return b;
}

/**
 * Downloads only the needed entries of a remote zip with HTTP range requests
 * (about 5 MB of the 40 MB client.jar) and returns them as a small, valid zip.
 * Returns null when range requests are not usable (then the whole file is downloaded).
 */
export async function downloadPartialZip(
  url: string,
  size: number,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const tailLen = Math.min(size, 65557);
  const tail = await fetchRange(url, size - tailLen, size, signal);
  if (tail === 'full') return null;
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('The Mojang download is not a valid jar.');
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) return null; // ZIP64: use the full download

  const cd = await fetchRange(url, cdOffset, cdOffset + cdSize, signal);
  if (cd === 'full') return null;
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const dec = new TextDecoder();
  // Selected central-directory records and the local ranges they need.
  const picked: { rec: number; len: number; offset: number; end: number }[] = [];
  for (let p = 0, i = 0; i < count; i++) {
    if (cv.getUint32(p, true) !== 0x02014b50) throw new Error('The Mojang download is not a valid jar.');
    const csize = cv.getUint32(p + 20, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const offset = cv.getUint32(p + 42, true);
    const len = 46 + nameLen + extraLen + commentLen;
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    if (WANTED.some((w) => name.startsWith(w)) && !name.endsWith('/')) {
      // The local header repeats the name; its extra field can differ, so leave some room.
      picked.push({ rec: p, len, offset, end: Math.min(cdOffset, offset + 30 + nameLen + extraLen + csize + 1024) });
    }
    p += len;
  }
  picked.sort((a, b) => a.offset - b.offset);
  // Merge nearby ranges into a few requests.
  const runs: { start: number; end: number }[] = [];
  for (const e of picked) {
    const last = runs[runs.length - 1];
    if (last && e.offset - last.end < 65536) last.end = Math.max(last.end, e.end);
    else runs.push({ start: e.offset, end: e.end });
  }
  const total = tailLen + cdSize + runs.reduce((n, r) => n + r.end - r.start, 0);
  let loaded = tailLen + cdSize;
  onProgress?.({ loaded, total });
  const parts: { start: number; bytes: Uint8Array }[] = [];
  for (const r of runs) {
    const b = await fetchRange(url, r.start, r.end, signal);
    if (b === 'full') return null;
    parts.push({ start: r.start, bytes: b });
    loaded += b.length;
    onProgress?.({ loaded, total });
  }

  // New zip: the downloaded runs back to back, then a central directory with moved offsets.
  const dataLen = parts.reduce((n, p) => n + p.bytes.length, 0);
  const newCdLen = picked.reduce((n, e) => n + e.len, 0);
  const out = new Uint8Array(dataLen + newCdLen + 22);
  const ov = new DataView(out.buffer);
  const moved = (orig: number): number => {
    let base = 0;
    for (const p of parts) {
      if (orig >= p.start && orig < p.start + p.bytes.length) return base + (orig - p.start);
      base += p.bytes.length;
    }
    throw new Error('Internal error while reading the Mojang download.');
  };
  let o = 0;
  for (const p of parts) {
    out.set(p.bytes, o);
    o += p.bytes.length;
  }
  for (const e of picked) {
    out.set(cd.subarray(e.rec, e.rec + e.len), o);
    ov.setUint32(o + 42, moved(e.offset), true);
    o += e.len;
  }
  ov.setUint32(o, 0x06054b50, true);
  ov.setUint16(o + 8, picked.length, true);
  ov.setUint16(o + 10, picked.length, true);
  ov.setUint32(o + 12, newCdLen, true);
  ov.setUint32(o + 16, dataLen, true);
  return out;
}

/** Downloads the textures, models and block states of a release's client.jar (the whole jar is SHA-1 checked when ranges cannot be used). */
export async function downloadClientJar(
  versionId: string | null,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; name: string }> {
  const { latest, releases } = await getReleases();
  const id = versionId ?? latest;
  const v = releases.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown Minecraft version ${id}`);
  const meta = await fetch(v.url, { mode: 'cors', signal });
  if (!meta.ok) throw new Error(`Mojang version info: HTTP ${meta.status}`);
  const info = (await meta.json()) as { downloads: { client: { url: string; sha1: string; size: number } } };
  const c = info.downloads.client;

  // Normally only the needed ~5 MB are fetched; fall back to the whole jar if ranges are not available.
  try {
    const partial = await downloadPartialZip(c.url, c.size, onProgress, signal);
    if (partial) return { bytes: partial, name: `Minecraft ${id}` };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  const r = await fetch(c.url, { mode: 'cors', signal });
  if (!r.ok || !r.body) throw new Error(`Mojang download: HTTP ${r.status}`);
  const total = c.size || Number(r.headers.get('content-length')) || 0;
  const bytes = new Uint8Array(total);
  const reader = r.body.getReader();
  let loaded = 0;
  let extra: Uint8Array[] | null = null; // only if the size was wrong
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!extra && loaded + value.length <= total) bytes.set(value, loaded);
    else (extra ??= [bytes.subarray(0, loaded)]).push(value);
    loaded += value.length;
    onProgress?.({ loaded, total });
  }
  let out = bytes.subarray(0, loaded);
  if (extra) {
    out = new Uint8Array(loaded);
    let o = 0;
    for (const part of extra) {
      out.set(part, o);
      o += part.length;
    }
  }
  if ((await sha1Hex(out)) !== c.sha1) throw new Error('The download from Mojang was corrupted. Please try again.');
  return { bytes: out, name: `Minecraft ${id}` };
}
