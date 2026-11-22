import { useEffect, useState } from 'preact/hooks';
import type { PackInfo } from '../render/resourcePack';
import { S } from './strings';

/**
 * One-click original textures: downloads the official client.jar from Mojang's
 * servers into this browser (never through Webmatica) and processes it locally.
 */
export function OfficialTextures({ onDone, compact }: { onDone?: (packs: PackInfo[]) => void; compact?: boolean }) {
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void import('../render/officialPack')
      .then((m) => m.getReleases())
      .then(({ latest, releases }) => {
        if (!live) return;
        setVersions(releases.map((r) => r.id));
        setVersion(latest);
      })
      .catch(() => {
        // Offline or blocked: the button still tries (and reports the error).
      });
    return () => {
      live = false;
    };
  }, []);

  const start = async () => {
    setBusy(S.officialConnecting);
    setError(null);
    try {
      const m = await import('../render/resourcePack');
      const packs = await m.addOfficialPack(version || null, (p) => {
        if (p.phase === 'process') setBusy(S.officialProcessing);
        else setBusy(S.officialDownloading(p.loaded / 1048576, p.total / 1048576));
      });
      onDone?.(packs);
    } catch (e) {
      setError(`${S.officialError}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="official">
      <div class="btn-row" style={{ alignItems: 'center' }}>
        <button class={`btn${compact ? ' small' : ' primary'}`} disabled={!!busy} onClick={start}>
          {busy ?? S.officialButton}
        </button>
        {versions.length > 0 && (
          <select
            class={compact ? 'small' : undefined}
            value={version}
            disabled={!!busy}
            title={S.officialVersion}
            aria-label={S.officialVersion}
            onChange={(e) => setVersion((e.target as HTMLSelectElement).value)}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>
      <div class="dim">{S.officialHint}</div>
      {error && <div class="err">{error}</div>}
    </div>
  );
}
