import { useMemo, useState } from 'preact/hooks';
import type { Schematic } from '../parser/types';
import type { ProjectState } from '../app/project';
import { FLAG_CUBE, QUAD_STRIDE, type CompileResult } from '../render/blockTables';
import { rgbaToCss } from '../render/colors';
import { visibleRange } from '../render/viewState';
import { forEachBlock, layerPaletteCounts } from '../materials/layerStats';
import { formatBreakdown } from '../materials/items';
import { buildMaterialList, sortMaterials, toCsv, toText, type MaterialEntry, type SortKey } from '../materials/materialList';
import { S } from './strings';

type Scope = 'all' | 'layer' | 'region';

interface Props {
  schematic: Schematic;
  project: ProjectState;
  update: (patch: Partial<ProjectState> | ((p: ProjectState) => Partial<ProjectState>)) => void;
  highlight: Set<number> | null;
  setHighlight: (s: Set<number> | null) => void;
  compiled: CompileResult;
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function safeFileName(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'schematic';
}

export function MaterialPanel({ schematic, project, update, highlight, setHighlight, compiled }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<SortKey>('count');
  const [query, setQuery] = useState('');
  const [hideCollected, setHideCollected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const layer = project.layer;
  const multiRegion = schematic.regions.length > 1;

  // Per-layer counts along the current axis (visible regions), computed once per axis/visibility.
  const perLayer = useMemo(
    () => (scope === 'layer' ? layerPaletteCounts(schematic, layer.axis, project.regionVisible) : null),
    [scope, schematic, layer.axis, project.regionVisible],
  );

  const counts = useMemo(() => {
    const P = schematic.palette.length;
    if (scope === 'all') return schematic.totalCounts;
    if (scope === 'region') {
      const out = new Uint32Array(P);
      const mask = schematic.regions.map((_, i) => i === project.selectedRegion);
      forEachBlock(schematic, mask, (_x, _y, _z, id) => out[id]++);
      return out;
    }
    const out = new Uint32Array(P);
    if (!perLayer) return out;
    const [min, max] = visibleRange(layer, schematic.size[layer.axis]);
    for (let l = min; l <= max; l++) {
      const base = l * P;
      for (let id = 1; id < P; id++) out[id] += perLayer[base + id];
    }
    return out;
  }, [scope, schematic, perLayer, layer.mode, layer.current, layer.rangeMin, layer.rangeMax, layer.axis, project.selectedRegion]);

  const list = useMemo(() => buildMaterialList(schematic.palette, counts), [schematic, counts]);
  const collected = useMemo(() => new Set(project.collected), [project.collected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let l = sortMaterials(list, sort, collected);
    if (q) l = l.filter((e) => e.name.toLowerCase().includes(q) || e.item.includes(q));
    if (hideCollected) l = l.filter((e) => !collected.has(e.item));
    return l;
  }, [list, sort, collected, query, hideCollected]);

  const swatch = useMemo(() => {
    const { tables, registry } = compiled;
    return (e: MaterialEntry): string => {
      const id = e.paletteIds[0];
      let app = 0;
      if (tables.flags[id] & FLAG_CUBE) app = tables.cubeFaces[id * 6 + 1] & 0xfff;
      else {
        // Prefer a side face (or a plant quad) over top/bottom edges for the swatch.
        const q0 = tables.quadStart[id];
        const q1 = tables.quadStart[id + 1];
        let pick = q1 > q0 ? q0 : -1;
        for (let q = q0; q < q1; q++) {
          if ((tables.quads[q * QUAD_STRIDE + 12] & 7) >= 2) {
            pick = q;
            break;
          }
        }
        if (pick >= 0) app = tables.quads[pick * QUAD_STRIDE + 13];
      }
      const a = registry.list[app];
      return a ? rgbaToCss(a.color) : '#777';
    };
  }, [compiled]);

  const totalItems = list.reduce((s, e) => s + e.total, 0);
  const missingTypes = list.filter((e) => !collected.has(e.item)).length;

  const toggleCollected = (item: string) =>
    update((pr) => {
      const set = new Set(pr.collected);
      if (set.has(item)) set.delete(item);
      else set.add(item);
      return { collected: [...set] };
    });

  const select = (e: MaterialEntry) => {
    if (selected === e.item) {
      setSelected(null);
      setHighlight(null);
    } else {
      setSelected(e.item);
      setHighlight(new Set(e.paletteIds));
    }
  };

  const scopeTitle = scope === 'all' ? S.scopeAll : scope === 'region' ? `${S.scopeRegion}: ${schematic.regions[project.selectedRegion]?.name}` : S.scopeLayer;
  const exportList = sortMaterials(list, sort, collected);
  const title = `${project.name} (${scopeTitle})`;

  return (
    <div class="mat-tools">
      <div class="section">
        <div class="row">
          <span class="muted">{S.materialsScope}</span>
          <select value={scope} onChange={(e) => setScope((e.target as HTMLSelectElement).value as Scope)} class="grow">
            <option value="all">{S.scopeAll}</option>
            <option value="layer">{S.scopeLayer}</option>
            {multiRegion && <option value="region">{S.scopeRegion}</option>}
          </select>
        </div>
        {scope === 'region' && multiRegion && (
          <select value={String(project.selectedRegion)} onChange={(e) => update({ selectedRegion: Number((e.target as HTMLSelectElement).value) })}>
            {schematic.regions.map((r, i) => (
              <option key={i} value={String(i)}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <input type="search" placeholder={S.materialsSearch} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label={S.materialsSearch} />
        <div class="row">
          <span class="muted">{S.sortBy}</span>
          <div class="seg">
            {(
              [
                ['count', S.sortCount],
                ['name', S.sortName],
                ['status', S.sortStatus],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button key={k} class={sort === k ? 'active' : ''} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label class="check">
          <input type="checkbox" checked={hideCollected} onChange={(e) => setHideCollected((e.target as HTMLInputElement).checked)} />
          {S.hideCollected}
        </label>
        <div class="dim">
          {S.totalTypes(list.length)} · {S.totalItems(totalItems)}
          <br />
          {list.length > 0 && (missingTypes === 0 ? <span style={{ color: 'var(--ok)' }}>{S.allCollected}</span> : S.remaining(missingTypes, list.length))}
        </div>
      </div>

      <div class="mat-list" role="list">
        {visible.length === 0 && <div class="dim">{S.noMaterials}</div>}
        {visible.map((e) => {
          const done = collected.has(e.item);
          return (
            <div
              key={e.item}
              role="listitem"
              class={`mat-row${done ? ' done' : ''}${selected === e.item && highlight ? ' selected' : ''}`}
              onClick={() => select(e)}
              title={`${e.item.includes(':') ? e.item : `minecraft:${e.item}`} · ${S.stackOf(e.stack)}`}
            >
              <input
                type="checkbox"
                checked={done}
                aria-label={S.collected}
                onClick={(ev) => ev.stopPropagation()}
                onChange={() => toggleCollected(e.item)}
              />
              <span class="swatch" style={{ background: swatch(e) }} />
              <span class="mat-main">
                <span class="mat-name">{e.name}</span>
                <span class="split mono">{formatBreakdown(e.total, e.stack)}</span>
              </span>
              <span class="mat-count mono total">{e.total.toLocaleString('en-US')}</span>
            </div>
          );
        })}
      </div>
      {list.length > 0 && <div class="dim">{S.highlightHint}</div>}

      <div class="btn-row">
        <button class="btn small" onClick={() => download(`${safeFileName(project.name)}-materials.csv`, toCsv(exportList, collected), 'text/csv;charset=utf-8')}>
          {S.exportCsv}
        </button>
        <button class="btn small" onClick={() => download(`${safeFileName(project.name)}-materials.txt`, toText(exportList, collected, title), 'text/plain;charset=utf-8')}>
          {S.exportText}
        </button>
        <button
          class="btn small"
          onClick={async () => {
            const ok = await copyText(toText(exportList, collected, title));
            setCopyState(ok ? S.copied : S.copyFailed);
            setTimeout(() => setCopyState(null), 1500);
          }}
        >
          {copyState ?? S.copy}
        </button>
        {highlight && (
          <button
            class="btn small ghost"
            onClick={() => {
              setSelected(null);
              setHighlight(null);
            }}
          >
            {S.clearHighlight}
          </button>
        )}
        {project.collected.length > 0 && (
          <button class="btn small ghost" onClick={() => confirm(S.resetCollectedConfirm) && update({ collected: [] })}>
            {S.resetCollected}
          </button>
        )}
      </div>
    </div>
  );
}
