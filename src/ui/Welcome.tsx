import { useRef, useState } from 'preact/hooks';
import type { ProjectState } from '../app/project';
import { SUPPORTED_EXTENSIONS } from '../parser/extensions';
import { S } from './strings';
import type { Tab } from './App';

interface Props {
  recent: ProjectState[];
  busy: boolean;
  error: string | null;
  storageOk: boolean;
  openTabs: Tab[];
  onDismissError: () => void;
  onFile: (f: File) => void;
  onExample: () => void;
  onResume: (p: ProjectState) => void;
  onRemove: (p: ProjectState) => void;
  onReturn: (id: string) => void;
}

function timeAgo(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return S.justNow;
  const m = Math.round(s / 60);
  if (m < 60) return S.minutesAgo(m);
  const h = Math.round(m / 60);
  if (h < 48) return S.hoursAgo(h);
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function Welcome(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div class="welcome">
      <div class="welcome-inner">
        <div class="brand">
          <h1>{S.appName}</h1>
          <span class="muted">{S.tagline}</span>
        </div>

        {p.error && (
          <div class="banner" role="alert">
            <div>
              <strong>{S.errorTitle}</strong>
              <div>{p.error}</div>
            </div>
            <button class="btn small" onClick={p.onDismissError}>
              {S.dismiss}
            </button>
          </div>
        )}
        {!p.storageOk && <div class="banner warn">{S.storageUnavailable}</div>}

        <div
          class={`drop${over ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              input.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setOver(false)}
          onDrop={() => setOver(false)}
        >
          {p.busy ? (
            <div class="row" style={{ justifyContent: 'center' }}>
              <div class="spinner" /> {S.loading}
            </div>
          ) : (
            <>
              <h2>{over ? S.dropActive : S.dropTitle}</h2>
              <p class="muted">{S.dropSubtitle}</p>
              <p class="dim">{S.dropHint}</p>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept={SUPPORTED_EXTENSIONS.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) p.onFile(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>

        <div class="btn-row">
          <button class="btn" onClick={p.onExample} disabled={p.busy}>
            {S.tryExample}
          </button>
          {p.openTabs.map((t) => (
            <button key={t.id} class="btn" onClick={() => p.onReturn(t.id)}>
              ↩ {t.name}
            </button>
          ))}
        </div>

        <div class="recent">
          <h3>{S.recentTitle}</h3>
          {p.recent.length === 0 && <div class="dim">{S.recentEmpty}</div>}
          {p.recent.map((r) => (
            <div class="recent-item" key={r.id}>
              <div style={{ minWidth: 0 }}>
                <div class="title">{r.name}</div>
                <div class="dim">
                  {r.dims.join(' × ')} · {S.blocksCount(r.totalBlocks)} · {S.lastOpened} {timeAgo(r.lastOpened)}
                </div>
                {r.progress > 0 && (
                  <>
                    <div class="progress-bar">
                      <div style={{ width: `${Math.round(r.progress * 100)}%` }} />
                    </div>
                    <div class="dim">{S.completed(`${Math.round(r.progress * 100)}%`)}</div>
                  </>
                )}
              </div>
              <div class="btn-row">
                <button class="btn primary" onClick={() => p.onResume(r)}>
                  {S.resume}
                </button>
                <button class="btn ghost small" onClick={() => p.onRemove(r)} title={S.remove}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div class="footer">
          <div>{S.textureCredit}</div>
          <div>{S.notAffiliated}</div>
          <div>
            <a href="https://github.com/MiguiiixZ/Webmatica" target="_blank" rel="noopener noreferrer">{S.sourceCode}</a> ·{' '}
            <a href={`${import.meta.env.BASE_URL}LICENSES.txt`} target="_blank" rel="noopener noreferrer">{S.licenses}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
