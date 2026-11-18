import { useEffect, useRef, useState } from 'preact/hooks';
import { addPack, getPackInfos, movePack, removeAllPacks, removePackAt, restorePack, type PackInfo } from '../render/resourcePack';
import { S } from './strings';

export function TexturePackSection() {
  const input = useRef<HTMLInputElement>(null);
  const [packs, setPacks] = useState<PackInfo[]>(getPackInfos());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void restorePack().then(setPacks);
  }, []);

  const run = async (fn: () => Promise<PackInfo[] | void>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setPacks(r ?? getPackInfos());
    } catch (e) {
      setError(`${S.packError}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="section">
      <h4>{S.texturePack}</h4>
      {packs.length === 0 && <div>{S.texturePackDefault}</div>}
      {packs.length > 0 && (
        <>
          <div class="dim">{S.packStackHint}</div>
          {packs.map((p, i) => (
            <div class="row" key={`${p.name}-${i}`} style={{ flexWrap: 'nowrap' }}>
              <div class="grow" style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 ? '▲ ' : ''}
                  {S.packLoaded(p.name, p.textures)}
                </div>
                <div class="dim">
                  {p.hasModels ? S.packModelsUsed : ''}
                  {p.hasLanguage ? ` ${S.packNamesUsed}` : ''}
                  {p.warnings.map((w) => ` ⚠ ${w}`).join('')}
                </div>
              </div>
              <button class="btn small icon" disabled={busy || i === 0} title={S.packUp} onClick={() => run(() => movePack(i, -1))}>
                ↑
              </button>
              <button class="btn small icon" disabled={busy || i === packs.length - 1} title={S.packDown} onClick={() => run(() => movePack(i, 1))}>
                ↓
              </button>
              <button class="btn small icon ghost" disabled={busy} title={S.remove} onClick={() => run(() => removePackAt(i))}>
                ✕
              </button>
            </div>
          ))}
          <div class="dim">{S.packBundledLast}</div>
        </>
      )}
      <div class="btn-row">
        <button class="btn small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? S.packLoading : packs.length ? S.addPack : S.loadPack}
        </button>
        {packs.length > 0 && (
          <button class="btn small ghost" disabled={busy} onClick={() => run(removeAllPacks)}>
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
          if (f) void run(() => addPack(f));
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </div>
  );
}
