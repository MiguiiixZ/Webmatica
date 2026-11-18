import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Schematic } from '../parser/types';
import { parseInWorker } from '../app/loader';
import { loadFile, loadProject, newProject, ProjectSaver, type ProjectState } from '../app/project';
import { sessionFiles } from '../app/sessionFiles';
import { Viewer, type PickResult } from '../render/viewer';
import { compileTables, type CompileResult } from '../render/blockTables';
import { builtinModel } from '../render/models';
import { loadDefaultPack, type TexturePack } from '../render/texturePack';
import { getActivePack, onPackChange, modelProviderFor } from '../render/packManager';
import { restorePack } from '../render/resourcePack';
import { AXIS_NAMES, visibleRange, type LayerMode, type LayerState, type RenderSettings } from '../render/viewState';
import { layerCounts } from '../materials/layerStats';
import { S } from './strings';
import type { Tab } from './App';
import { LayerPanel } from './LayerPanel';
import { InfoPanel } from './InfoPanel';
import { SettingsPanel } from './SettingsPanel';
import { MaterialPanel } from './MaterialPanel';
import { StatusOverlay } from './StatusOverlay';
import { MetricsOverlay } from './MetricsOverlay';
import { ShortcutsModal } from './ShortcutsModal';

interface Props {
  tabs: Tab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onOpenFile: (f: File) => void;
  onHome: () => void;
  onLoadError: (id: string, message: string) => void;
  onRename: (id: string, name: string) => void;
  settings: RenderSettings;
  setSettings: (s: RenderSettings) => void;
}

export type RightTab = 'materials' | 'info' | 'settings';
const MODES: LayerMode[] = ['all', 'single', 'below', 'above', 'range'];

export interface HoverInfo {
  pick: PickResult;
}

export default function ViewerScreen(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saver = useRef(new ProjectSaver());
  const [schematic, setSchematic] = useState<Schematic | null>(null);
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const [status, setStatus] = useState<string | null>(S.parsing);
  const [meshProgress, setMeshProgress] = useState<[number, number]>([0, 0]);
  const [hover, setHover] = useState<PickResult | null>(null);
  const [measureOn, setMeasureOn] = useState(false);
  const [measure, setMeasure] = useState<[number, number, number][]>([]);
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth > 900);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 1200);
  const [rightTab, setRightTab] = useState<RightTab>('materials');
  const [highlight, setHighlight] = useState<Set<number> | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  const [packVersion, setPackVersion] = useState(0);
  const settingsRef = useRef(p.settings);
  settingsRef.current = p.settings;

  // ---- Viewer lifecycle -------------------------------------------------
  useEffect(() => {
    let v: Viewer;
    try {
      v = new Viewer(canvasRef.current!, p.settings);
    } catch {
      p.onLoadError(p.activeId, S.noWebgl);
      return;
    }
    viewerRef.current = v;
    v.onMeshProgress = (pending, total) => setMeshProgress([pending, total]);
    v.onCameraChange = () => {
      const pr = projectRef.current;
      if (!pr) return;
      pr.camera = v.getCameraState();
      saver.current.schedule(pr, 1500);
    };
    const flush = () => {
      if (document.hidden) saver.current.flush();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', () => saver.current.flush());
    return () => {
      saver.current.flush();
      document.removeEventListener('visibilitychange', flush);
      v.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => onPackChange(() => setPackVersion((n) => n + 1)), []);

  // ---- Load the active schematic ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    const id = p.activeId;
    saver.current.flush();
    setStatus(S.parsing);
    setHover(null);
    setHighlight(null);
    setMeasure([]);
    void (async () => {
      try {
        const file = sessionFiles.get(id) ?? (await loadFile(id));
        if (!file) throw new Error('The file is no longer stored in this browser. Please open it again.');
        sessionFiles.set(id, file);
        const { schematic: sch } = await parseInWorker(file.bytes, file.name);
        if (cancelled) return;
        const totalBlocks = sch.regions.reduce((s, r) => s + r.blockCount, 0);
        let pr = await loadProject(id);
        if (!pr) {
          pr = newProject(
            { id, name: sch.meta.name, fileName: file.name, fileSize: file.bytes.length, format: sch.format, dims: sch.size, totalBlocks },
            sch.regions.length,
          );
        }
        if (pr.regionVisible.length !== sch.regions.length) pr.regionVisible = new Array(sch.regions.length).fill(true);
        pr.lastOpened = Date.now();
        pr.totalBlocks = totalBlocks;
        p.onRename(id, pr.name);
        setStatus(S.loadingTextures);
        await restorePack().catch(() => null);
        let pack: TexturePack | null = getActivePack();
        if (!pack) {
          try {
            pack = await loadDefaultPack();
          } catch {
            pack = null;
          }
        }
        if (cancelled) return;
        const comp = compileTables(sch.palette, modelProviderFor(pack) ?? builtinModel, pack);
        const v = viewerRef.current;
        if (!v) return;
        v.load(sch, comp, pack, pr.regionVisible);
        v.setTransform(pr.transform);
        if (pr.camera) v.setCameraState(pr.camera);
        setCameraMode(v.cameraMode);
        projectRef.current = pr;
        setSchematic(sch);
        setCompiled(comp);
        setProject({ ...pr });
        saver.current.schedule(pr, 10);
        setStatus(null);
      } catch (e) {
        if (!cancelled) p.onLoadError(id, (e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.activeId]);

  // Reload tables when the texture pack changes.
  useEffect(() => {
    if (!packVersion || !schematic) return;
    void (async () => {
      let pack = getActivePack();
      if (!pack) pack = await loadDefaultPack().catch(() => null);
      const comp = compileTables(schematic.palette, modelProviderFor(pack) ?? builtinModel, pack);
      viewerRef.current?.setTables(comp, pack);
      setCompiled(comp);
    })();
  }, [packVersion]);

  // ---- Project updates ----------------------------------------------------
  const update = useCallback((patch: Partial<ProjectState> | ((p: ProjectState) => Partial<ProjectState>)) => {
    const cur = projectRef.current;
    if (!cur) return;
    const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
    projectRef.current = next;
    setProject(next);
    saver.current.schedule(next);
  }, []);

  const counts = useMemo(() => {
    if (!schematic || !project) return null;
    return [0, 1, 2].map((a) => layerCounts(schematic, a as 0 | 1 | 2, project.regionVisible));
  }, [schematic, project?.regionVisible]);

  const axis = project?.layer.axis ?? 1;
  const doneSet = useMemo(() => new Set(project?.doneLayers[String(axis)] ?? []), [project?.doneLayers, axis]);
  const nextLayer = useMemo(() => {
    if (!counts) return null;
    const c = counts[axis];
    for (let i = 0; i < c.length; i++) if (c[i] > 0 && !doneSet.has(i)) return i;
    return null;
  }, [counts, axis, doneSet]);

  // Push layer state to the viewer.
  useEffect(() => {
    if (!project || !viewerRef.current) return;
    viewerRef.current.setLayer(project.layer, nextLayer);
  }, [project?.layer, nextLayer, schematic]);

  useEffect(() => {
    if (project) viewerRef.current?.setTransform(project.transform);
  }, [project?.transform]);

  const regionKey = project?.regionVisible.join(',');
  const firstRegionRender = useRef(true);
  useEffect(() => {
    if (!project) return;
    if (firstRegionRender.current) {
      firstRegionRender.current = false;
      return;
    }
    viewerRef.current?.setRegionVisibility(project.regionVisible);
  }, [regionKey]);

  useEffect(() => {
    viewerRef.current?.setSettings(p.settings);
  }, [p.settings]);

  useEffect(() => {
    viewerRef.current?.setHighlight(highlight);
  }, [highlight]);

  // Progress cache for the start screen (fraction of blocks in done Y layers).
  useEffect(() => {
    if (!project || !counts) return;
    const c = counts[axis];
    let done = 0;
    let total = 0;
    for (let i = 0; i < c.length; i++) {
      total += c[i];
      if (doneSet.has(i)) done += c[i];
    }
    const progress = total ? done / total : 0;
    if (Math.abs(progress - project.progress) > 1e-9) update({ progress });
  }, [doneSet, counts]);

  // ---- Layer helpers --------------------------------------------------------
  const layerLen = schematic && project ? schematic.size[project.layer.axis] : 1;
  const setLayer = useCallback(
    (patch: Partial<LayerState>) => update((pr) => ({ layer: { ...pr.layer, ...patch } })),
    [update],
  );
  const stepLayer = useCallback(
    (delta: number) => {
      const pr = projectRef.current;
      if (!pr || !schematic) return;
      const len = schematic.size[pr.layer.axis];
      const l = pr.layer;
      if (l.mode === 'range') {
        const span = l.rangeMax - l.rangeMin;
        const min = Math.max(0, Math.min(len - 1 - span, l.rangeMin + delta));
        setLayer({ rangeMin: min, rangeMax: min + span, current: Math.max(0, Math.min(len - 1, l.current + delta)) });
        return;
      }
      const mode = l.mode === 'all' ? 'below' : l.mode;
      const current = l.mode === 'all' ? (delta > 0 ? 0 : len - 1) : Math.max(0, Math.min(len - 1, l.current + delta));
      setLayer({ mode, current });
    },
    [schematic, setLayer],
  );

  const toggleDone = useCallback(
    (layer: number) =>
      update((pr) => {
        const key = String(pr.layer.axis);
        const set = new Set(pr.doneLayers[key] ?? []);
        if (set.has(layer)) set.delete(layer);
        else set.add(layer);
        return { doneLayers: { ...pr.doneLayers, [key]: [...set].sort((a, b) => a - b) } };
      }),
    [update],
  );

  // ---- Pointer: hover and measure -------------------------------------------
  const pending = useRef<{ x: number; y: number } | null>(null);
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (e.buttons || document.hidden) return; // ignore while dragging the camera or in the background
    if (!pending.current) {
      requestAnimationFrame(() => {
        const pt = pending.current;
        pending.current = null;
        const v = viewerRef.current;
        if (!pt || !v) return;
        const hit = v.pick(pt.x, pt.y);
        v.setHover(hit ? hit.pos : null);
        setHover(hit);
      });
    }
    pending.current = { x: e.clientX, y: e.clientY };
  }, []);

  const downAt = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    downAt.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = downAt.current;
    downAt.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return; // it was a drag
    const v = viewerRef.current;
    if (!v || !measureOn) return;
    const hit = v.pick(e.clientX, e.clientY);
    if (!hit) return;
    setMeasure((m) => (m.length >= 2 ? [hit.pos] : [...m, hit.pos]));
  };
  useEffect(() => {
    viewerRef.current?.setMeasure(measure[0] ?? null, measure[1] ?? null);
  }, [measure]);

  // ---- Keyboard shortcuts --------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const v = viewerRef.current;
      const pr = projectRef.current;
      switch (e.key) {
        case 'PageUp':
        case ']':
          e.preventDefault();
          stepLayer(1);
          break;
        case 'PageDown':
        case '[':
          e.preventDefault();
          stepLayer(-1);
          break;
        case 'Home':
          if (pr && pr.layer.mode !== 'all') setLayer({ current: 0 });
          break;
        case 'End':
          if (pr && pr.layer.mode !== 'all' && schematic) setLayer({ current: schematic.size[pr.layer.axis] - 1 });
          break;
        case 'l':
        case 'L':
          if (pr) setLayer({ mode: MODES[(MODES.indexOf(pr.layer.mode) + 1) % MODES.length] });
          break;
        case 'd':
        case 'D':
          if (pr && v?.cameraMode !== 'fly') toggleDone(pr.layer.current);
          break;
        case 'n':
        case 'N':
          if (nextLayer !== null && pr) setLayer({ current: nextLayer, mode: pr.layer.mode === 'all' ? 'below' : pr.layer.mode });
          break;
        case 'c':
        case 'C':
          if (v) {
            v.setCameraMode(v.cameraMode === 'orbit' ? 'fly' : 'orbit');
            setCameraMode(v.cameraMode);
          }
          break;
        case 'r':
        case 'R':
          v?.resetCamera();
          break;
        case 't':
        case 'T':
          p.setSettings({ ...settingsRef.current, textured: !settingsRef.current.textured });
          break;
        case 'g':
        case 'G':
          p.setSettings({ ...settingsRef.current, ghost: !settingsRef.current.ghost });
          break;
        case 'm':
        case 'M':
          setMeasureOn((m) => !m);
          setMeasure([]);
          break;
        case 'Tab':
          e.preventDefault();
          if (leftOpen || rightOpen) {
            setLeftOpen(false);
            setRightOpen(false);
          } else {
            setLeftOpen(true);
            setRightOpen(window.innerWidth > 760);
          }
          break;
        case 'Escape':
          setHighlight(null);
          setMeasure([]);
          setMeasureOn(false);
          setShowHelp(false);
          break;
        case '?':
          setShowHelp((s) => !s);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepLayer, setLayer, toggleDone, nextLayer, schematic, leftOpen, rightOpen, p.setSettings]);

  // ---- Render -----------------------------------------------------------------------
  const range = project && schematic ? visibleRange(project.layer, layerLen) : null;
  const meshing = meshProgress[0] > 0 && !status;

  return (
    <div class="viewer">
      <div class="topbar">
        <button class="btn ghost icon" title={S.home} onClick={p.onHome} aria-label={S.home}>
          ⌂
        </button>
        <button class={`btn ghost${leftOpen ? ' active' : ''}`} onClick={() => setLeftOpen(!leftOpen)}>
          {S.panelLayers}
        </button>
        <div class="tabs">
          {p.tabs.map((t) => (
            <div key={t.id} class={`tab${t.id === p.activeId ? ' active' : ''}`} onClick={() => p.onSwitch(t.id)} title={t.name}>
              <span>{t.name}</span>
              <button
                aria-label={S.close}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(t.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button class="btn ghost icon" title={S.openAnother} onClick={() => fileInput.current?.click()}>
            +
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".litematic,.schem,.nbt,.schematic"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) p.onOpenFile(f);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>
        <div class="spacer" />
        <button
          class="btn ghost"
          title={S.cameraToggle}
          onClick={() => {
            const v = viewerRef.current;
            if (!v) return;
            v.setCameraMode(v.cameraMode === 'orbit' ? 'fly' : 'orbit');
            setCameraMode(v.cameraMode);
          }}
        >
          <span class="long">{cameraMode === 'orbit' ? S.cameraOrbit : S.cameraFly}</span>
          <span class="short">{cameraMode === 'orbit' ? S.cameraOrbitShort : S.cameraFlyShort}</span>
        </button>
        <button class="btn ghost hide-narrow" title={S.resetCamera} onClick={() => viewerRef.current?.resetCamera()}>
          ⟲
        </button>
        <button class={`btn ghost hide-narrow${measureOn ? ' active' : ''}`} title={S.measureHint} onClick={() => { setMeasureOn(!measureOn); setMeasure([]); }}>
          {S.measure}
        </button>
        <button class="btn ghost icon" title={S.shortcuts} onClick={() => setShowHelp(true)}>
          ?
        </button>
        <button class={`btn ghost${rightOpen ? ' active' : ''}`} onClick={() => setRightOpen(!rightOpen)}>
          <span class="long">{S.panelMaterials}</span>
          <span class="short">{S.panelMaterialsShort}</span>
        </button>
      </div>

      <div class="main">
        {leftOpen && project && schematic && counts && (
          <aside class="side left">
            <div class="side-body">
              <LayerPanel
                project={project}
                schematic={schematic}
                counts={counts}
                doneSet={doneSet}
                nextLayer={nextLayer}
                setLayer={setLayer}
                stepLayer={stepLayer}
                toggleDone={toggleDone}
                update={update}
              />
            </div>
          </aside>
        )}

        <div class="canvas-wrap" onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerLeave={() => { viewerRef.current?.setHover(null); setHover(null); }}>
          <canvas ref={canvasRef} />
          {project && schematic && range && (
            <div class="overlay layer-badge chip mono">
              {project.layer.mode === 'all'
                ? S.modeAll
                : project.layer.mode === 'range' || range[0] !== range[1]
                  ? `${AXIS_NAMES[project.layer.axis]} ${range[0]}–${range[1]}`
                  : `${AXIS_NAMES[project.layer.axis]} ${range[0]}`}
              {project.origin && project.layer.mode !== 'all' && (
                <span class="muted"> · {S.worldHeight(AXIS_NAMES[project.layer.axis], project.origin[project.layer.axis] + project.layer.current)}</span>
              )}
              {doneSet.has(project.layer.current) && project.layer.mode !== 'all' && <span style={{ color: 'var(--ok)' }}> ✓</span>}
            </div>
          )}
          {schematic && compiled && (
            <StatusOverlay
              hover={hover}
              schematic={schematic}
              origin={project?.origin ?? null}
              measureOn={measureOn}
              measure={measure}
              onClearMeasure={() => setMeasure([])}
              cameraMode={cameraMode}
            />
          )}
          {p.settings.showMetrics && viewerRef.current && schematic && <MetricsOverlay viewer={viewerRef.current} schematic={schematic} />}
          {(status || meshing) && (
            <div class="loading-overlay" style={meshing ? { background: 'transparent', alignItems: 'flex-start', paddingTop: 48 } : undefined}>
              <div class="chip row">
                <div class="spinner" />
                {status ?? `${S.meshing} ${Math.max(0, meshProgress[1] - meshProgress[0])} / ${meshProgress[1]}`}
              </div>
            </div>
          )}
        </div>

        {rightOpen && project && schematic && compiled && (
          <aside class="side">
            <div class="side-tabs">
              <button class={rightTab === 'materials' ? 'active' : ''} onClick={() => setRightTab('materials')}>
                {S.panelMaterials}
              </button>
              <button class={rightTab === 'info' ? 'active' : ''} onClick={() => setRightTab('info')}>
                {S.panelInfo}
              </button>
              <button class={rightTab === 'settings' ? 'active' : ''} onClick={() => setRightTab('settings')}>
                {S.panelSettings}
              </button>
            </div>
            <div class="side-body">
              {rightTab === 'materials' && (
                <MaterialPanel
                  schematic={schematic}
                  project={project}
                  update={update}
                  highlight={highlight}
                  setHighlight={setHighlight}
                  compiled={compiled}
                />
              )}
              {rightTab === 'info' && <InfoPanel schematic={schematic} project={project} />}
              {rightTab === 'settings' && <SettingsPanel settings={p.settings} setSettings={p.setSettings} />}
            </div>
          </aside>
        )}
      </div>
      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
