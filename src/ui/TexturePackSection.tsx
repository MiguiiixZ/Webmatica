import { useEffect, useRef, useState } from 'preact/hooks';
import { getPackInfo, installPack, removePack, restorePack, type PackInfo } from '../render/resourcePack';
import { S } from './strings';

export function TexturePackSection() {
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<PackInfo | null>(getPackInfo());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void restorePack().then((i) => i && setInfo(i));
  }, []);

  const onFile = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      setInfo(await installPack(f));
    } catch (e) {
      setError(`${S.packError}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="section">
      <h4>{S.texturePack}</h4>
      <div>{info ? S.packLoaded(info.name, info.textures) : S.texturePackDefault}</div>
      {info && (
        <div class="dim">
          {info.hasModels ? 'Block models from this pack are used.' : 'Built-in block shapes are used (the pack has no block models).'}
          {info.hasLanguage ? ' Block names from this pack are used.' : ''}
          {info.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}
      <div class="btn-row">
        <button class="btn small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? S.packLoading : S.loadPack}
        </button>
        {info && (
          <button
            class="btn small ghost"
            disabled={busy}
            onClick={async () => {
              await removePack();
              setInfo(null);
            }}
          >
            {S.removePack}
          </button>
        )}
      </div>
      <div class="dim">{S.loadPackHint}</div>
      {error && <div class="err">{error}</div>}
      <input
        ref={input}
        type="file"
        accept=".jar,.zip"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) void onFile(f);
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </div>
  );
}
