import { lazy, Suspense } from 'preact/compat';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { hashBytes, db } from '../storage/db';
import { loadProject, saveFile, listProjects, deleteProject, type ProjectState } from '../app/project';
import { defaultRenderSettings, type RenderSettings } from '../render/viewState';
import { sessionFiles } from '../app/sessionFiles';
import { Welcome } from './Welcome';
import { S } from './strings';

// The viewer (Three.js, meshing, materials) is only downloaded once a file is opened.
const ViewerScreen = lazy(() => import('./ViewerScreen'));

export interface Tab {
  id: string;
  name: string;
}

const MAX_FILE_BYTES = 512 * 1024 * 1024;

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recent, setRecent] = useState<ProjectState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [settings, setSettingsState] = useState<RenderSettings>(defaultRenderSettings());

  useEffect(() => {
    void (async () => {
      setStorageOk(await db.available());
      const saved = await db.get<Partial<RenderSettings>>('settings', 'render');
      if (saved) setSettingsState({ ...defaultRenderSettings(), ...saved });
      setRecent(await listProjects());
      // Original textures out of the box (downloaded once from Mojang, in the background).
      void import('../render/resourcePack').then((m) => m.ensureOfficialTextures());
    })();
  }, []);

  const setSettings = useCallback((s: RenderSettings) => {
    setSettingsState(s);
    void db.put('settings', 'render', s);
  }, []);

  const refreshRecent = useCallback(async () => setRecent(await listProjects()), []);

  const openTab = useCallback((id: string, name: string) => {
    setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, name }]));
    setActiveId(id);
  }, []);

  const openBytes = useCallback(
    async (bytes: Uint8Array, fileName: string) => {
      setError(null);
      if (bytes.length > MAX_FILE_BYTES) {
        setError('The file is too large (over 512 MB).');
        return;
      }
      setBusy(true);
      try {
        const id = await hashBytes(bytes);
        sessionFiles.set(id, { name: fileName, bytes });
        void saveFile(id, fileName, bytes);
        const existing = await loadProject(id);
        openTab(id, existing?.name ?? fileName.replace(/\.[^.]+$/, ''));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [openTab],
  );

  const openFile = useCallback(
    async (file: File) => {
      try {
        await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
      } catch (e) {
        setError(`${S.errorTitle}: ${(e as Error).message}`);
      }
    },
    [openBytes],
  );

  const openExample = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/example-cottage.litematic`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await openBytes(new Uint8Array(await res.arrayBuffer()), 'example-cottage.litematic');
    } catch (e) {
      setError(`${S.errorTitle}: ${(e as Error).message}`);
      setBusy(false);
    }
  }, [openBytes]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((t) => {
        const next = t.filter((x) => x.id !== id);
        if (activeId === id) setActiveId(next.length ? next[next.length - 1].id : null);
        return next;
      });
      sessionFiles.delete(id);
      void refreshRecent();
    },
    [activeId, refreshRecent],
  );

  const goHome = useCallback(() => {
    setActiveId(null);
    void refreshRecent();
  }, [refreshRecent]);

  const onLoadError = useCallback(
    (id: string, message: string) => {
      setError(message);
      setTabs((t) => t.filter((x) => x.id !== id));
      setActiveId(null);
      sessionFiles.delete(id);
    },
    [],
  );

  const renameTab = useCallback((id: string, name: string) => {
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, name } : x)));
  }, []);

  // Drag and drop anywhere in the window.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void openFile(e.dataTransfer.files[0]);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  if (activeId) {
    return (
      <Suspense fallback={<div class="loading-overlay"><div class="spinner" /></div>}>
        <ViewerScreen
          tabs={tabs}
          activeId={activeId}
          onSwitch={setActiveId}
          onClose={closeTab}
          onOpenFile={openFile}
          onHome={goHome}
          onLoadError={onLoadError}
          onRename={renameTab}
          settings={settings}
          setSettings={setSettings}
        />
      </Suspense>
    );
  }

  return (
    <Welcome
      recent={recent}
      busy={busy}
      error={error}
      storageOk={storageOk}
      onDismissError={() => setError(null)}
      onFile={openFile}
      onExample={openExample}
      onResume={(p) => openTab(p.id, p.name)}
      onRemove={async (p) => {
        if (!confirm(S.removeConfirm)) return;
        await deleteProject(p.id);
        await refreshRecent();
      }}
      openTabs={tabs}
      onReturn={(id) => setActiveId(id)}
    />
  );
}
