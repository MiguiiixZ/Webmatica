import { useState } from 'preact/hooks';
import type { Schematic } from '../parser/types';
import type { ProjectState } from '../app/project';
import { AXIS_NAMES, visibleRange, type Axis, type LayerMode, type LayerState } from '../render/viewState';
import { S } from './strings';

interface Props {
  project: ProjectState;
  schematic: Schematic;
  counts: Uint32Array[];
  setLayer: (patch: Partial<LayerState>) => void;
  stepLayer: (delta: number) => void;
  update: (patch: Partial<ProjectState> | ((p: ProjectState) => Partial<ProjectState>)) => void;
}

const MODE_LABELS: [LayerMode, string][] = [
  ['all', S.modeAll],
  ['single', S.modeSingle],
  ['below', S.modeBelow],
  ['above', S.modeAbove],
  ['range', S.modeRange],
];

export function LayerPanel({ project, schematic, counts, setLayer, stepLayer, update }: Props) {
  const l = project.layer;
  const len = schematic.size[l.axis];
  const c = counts[l.axis];
  const axisName = AXIS_NAMES[l.axis];
  const [min, max] = visibleRange(l, len);
  const cur = Math.min(l.current, len - 1);
  // Progress is derived from the current layer: it and everything below it count as built.
  const atLayer = l.mode !== 'all';
  let belowBlocks = 0;
  let totalBlocks = 0;
  for (let i = 0; i < c.length; i++) {
    totalBlocks += c[i];
    if (atLayer && i <= cur) belowBlocks += c[i];
  }
  // Rounded down so 100% only shows once the last layer with blocks is reached.
  const pct = totalBlocks ? (Math.floor((belowBlocks / totalBlocks) * 1000) / 10).toFixed(1).replace(/\.0$/, '') + '%' : '0%';
  const maxCount = Math.max(1, ...c);

  return (
    <>
      <div class="section">
        <h4>{S.panelLayers}</h4>
        <div class="seg" role="group" aria-label={S.layerMode}>
          {MODE_LABELS.map(([m, label]) => (
            <button key={m} class={l.mode === m ? 'active' : ''} onClick={() => setLayer({ mode: m })}>
              {label}
            </button>
          ))}
        </div>
        <div class="row">
          <span class="muted">{S.axis}</span>
          <div class="seg">
            {([0, 1, 2] as Axis[]).map((a) => (
              <button
                key={a}
                class={l.axis === a ? 'active' : ''}
                onClick={() => setLayer({ axis: a, current: Math.min(l.current, schematic.size[a] - 1), rangeMin: 0, rangeMax: schematic.size[a] - 1 })}
              >
                {AXIS_NAMES[a]}
              </button>
            ))}
          </div>
        </div>

        {l.mode !== 'range' && (
          <>
            <div class="layer-big">
              <button class="btn icon" onClick={() => stepLayer(-1)} title={`${S.layerDown} (PageDown)`} aria-label={S.layerDown}>
                −
              </button>
              <div class="num mono" title={S.layerOf(cur + 1, len)}>
                {l.mode === 'all' ? '–' : `${axisName} ${cur}`}
              </div>
              <button class="btn icon" onClick={() => stepLayer(1)} title={`${S.layerUp} (PageUp)`} aria-label={S.layerUp}>
                +
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={len - 1}
              value={cur}
              onInput={(e) => setLayer({ current: Number((e.target as HTMLInputElement).value) })}
              aria-label={S.layer}
            />
          </>
        )}
        {l.mode === 'range' && (
          <div class="row">
            <label class="row">
              {S.rangeMin}
              <input type="number" min={0} max={len - 1} value={min} onInput={(e) => setLayer({ rangeMin: Number((e.target as HTMLInputElement).value) })} />
            </label>
            <label class="row">
              {S.rangeMax}
              <input type="number" min={0} max={len - 1} value={max} onInput={(e) => setLayer({ rangeMax: Number((e.target as HTMLInputElement).value) })} />
            </label>
          </div>
        )}

        {l.mode !== 'all' && (
          <div class="dim">
            {S.relativeHeight(axisName, cur)}
            {project.origin && <> · {S.worldHeight(axisName, project.origin[l.axis] + cur)}</>}
            <br />
            {S.blocksInLayer(c[cur] ?? 0)}
          </div>
        )}

        <label class={`check${l.mode === 'all' || l.mode === 'single' ? ' disabled' : ''}`}>
          <input type="checkbox" disabled={l.mode === 'all' || l.mode === 'single'} checked={l.dimBelow} onChange={(e) => setLayer({ dimBelow: (e.target as HTMLInputElement).checked })} />
          {S.dimBelow}
        </label>
        <label class={`check${l.mode === 'all' ? ' disabled' : ''}`}>
          <input type="checkbox" disabled={l.mode === 'all'} checked={l.highlightCurrent} onChange={(e) => setLayer({ highlightCurrent: (e.target as HTMLInputElement).checked })} />
          {S.highlightCurrent}
        </label>
        <label class={`check${l.mode === 'all' ? ' disabled' : ''}`}>
          <input type="checkbox" disabled={l.mode === 'all'} checked={l.highlightNext} onChange={(e) => setLayer({ highlightNext: (e.target as HTMLInputElement).checked })} />
          {S.highlightNext}
        </label>
      </div>

      <div class="section">
        <h4>{S.progress}</h4>
        <div class="progress-bar">
          <div style={{ width: pct }} />
        </div>
        <div class="dim">{atLayer ? S.progressAtLayer(pct, belowBlocks, totalBlocks) : S.progressPickLayer}</div>
        <div
          class="layer-strip"
          title={S.layer}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const i = Math.min(len - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * len)));
            setLayer({ current: i, mode: l.mode === 'all' ? 'below' : l.mode });
          }}
        >
          {Array.from(c).map((v, i) => (
            <div
              key={i}
              style={{
                background: v === 0 ? 'transparent' : atLayer && i <= cur ? 'var(--ok)' : `rgba(170,175,188,${0.25 + (0.5 * v) / maxCount})`,
                outline: i === cur && l.mode !== 'all' ? '1px solid #fff' : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <OriginEditor project={project} update={update} />

      {schematic.regions.length > 1 && (
        <div class="section">
          <h4>{S.panelRegions}</h4>
          {schematic.regions.map((r, i) => (
            <label class="check" key={i}>
              <input
                type="checkbox"
                checked={project.regionVisible[i]}
                onChange={(e) => {
                  const v = project.regionVisible.slice();
                  v[i] = (e.target as HTMLInputElement).checked;
                  update({ regionVisible: v });
                }}
              />
              <span class="grow">{r.name}</span>
              <span class="dim">{S.regionBlocks(r.blockCount)}</span>
            </label>
          ))}
          <button class="btn small" onClick={() => update({ regionVisible: project.regionVisible.map(() => true) })}>
            {S.showAll}
          </button>
        </div>
      )}

      <div class="section">
        <h4>{S.view}</h4>
        <div class="btn-row">
          <button class="btn small" onClick={() => update((pr) => ({ transform: { ...pr.transform, rotation: (pr.transform.rotation + 1) % 4 } }))}>
            ⟳ {S.rotate}
          </button>
          <button class={`btn small${project.transform.mirrorX ? ' active' : ''}`} onClick={() => update((pr) => ({ transform: { ...pr.transform, mirrorX: !pr.transform.mirrorX } }))}>
            {S.mirrorX}
          </button>
          <button class={`btn small${project.transform.mirrorZ ? ' active' : ''}`} onClick={() => update((pr) => ({ transform: { ...pr.transform, mirrorZ: !pr.transform.mirrorZ } }))}>
            {S.mirrorZ}
          </button>
          {(project.transform.rotation || project.transform.mirrorX || project.transform.mirrorZ) ? (
            <button class="btn small ghost" onClick={() => update({ transform: { rotation: 0, mirrorX: false, mirrorZ: false } })}>
              {S.resetTransform}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function OriginEditor({ project, update }: { project: ProjectState; update: Props['update'] }) {
  const [draft, setDraft] = useState<string[]>(() => (project.origin ?? [0, 0, 0]).map(String));
  const apply = (vals: string[]) => {
    setDraft(vals);
    const nums = vals.map((v) => Number(v));
    if (vals.every((v) => v.trim() !== '') && nums.every((n) => Number.isFinite(n))) update({ origin: nums.map(Math.trunc) as [number, number, number] });
  };
  return (
    <div class="section">
      <h4>{S.origin}</h4>
      <div class="dim">{S.originHint}</div>
      <div class="row">
        {['X', 'Y', 'Z'].map((a, i) => (
          <label class="row" key={a} style={{ gap: 4 }}>
            <span class="dim">{a}</span>
            <input
              type="number"
              value={project.origin ? draft[i] : ''}
              placeholder="0"
              onInput={(e) => {
                const v = draft.slice();
                v[i] = (e.target as HTMLInputElement).value;
                apply(v);
              }}
              style={{ width: 70 }}
            />
          </label>
        ))}
        {project.origin && (
          <button class="btn small ghost" onClick={() => update({ origin: null })}>
            {S.originClear}
          </button>
        )}
      </div>
    </div>
  );
}
