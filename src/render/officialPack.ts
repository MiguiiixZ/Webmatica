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

/** Downloads (and verifies) the client.jar of a release. */
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
