/**
 * Per-schematic persisted state ("project"): view, layer progress, checklist.
 */
import { db } from '../storage/db';
import type { SchematicFormat } from '../parser/types';
import { defaultLayerState, type CameraState, type LayerState, type ViewTransform } from '../render/viewState';

export interface ProjectState {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  format: SchematicFormat;
  dims: [number, number, number];
  totalBlocks: number;
  addedAt: number;
  lastOpened: number;
  camera: CameraState | null;
  layer: LayerState;
  regionVisible: boolean[];
  selectedRegion: number;
  transform: ViewTransform;
  /** World coordinates of the schematic's minimum corner, if known. */
  origin: [number, number, number] | null;
  /** Item ids marked as collected. */
  collected: string[];
  /** Finished layers per axis ("0", "1", "2" -> layer indices). */
  doneLayers: Record<string, number[]>;
  /** Fraction of blocks in finished layers (along Y), cached for the start screen. */
  progress: number;
}

export function newProject(init: Pick<ProjectState, 'id' | 'name' | 'fileName' | 'fileSize' | 'format' | 'dims' | 'totalBlocks'>, regions: number): ProjectState {
  const now = Date.now();
  const layer = defaultLayerState();
  layer.rangeMax = Math.max(0, init.dims[1] - 1);
  return {
    ...init,
    addedAt: now,
    lastOpened: now,
    camera: null,
    layer,
    regionVisible: new Array(regions).fill(true),
    selectedRegion: 0,
    transform: { rotation: 0, mirrorX: false, mirrorZ: false },
    origin: null,
    collected: [],
    doneLayers: {},
    progress: 0,
  };
}

export async function loadProject(id: string): Promise<ProjectState | undefined> {
  return db.get<ProjectState>('projects', id);
}

export async function listProjects(): Promise<ProjectState[]> {
  const all = await db.all<ProjectState>('projects');
  return all.sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function saveProject(p: ProjectState): Promise<void> {
  await db.put('projects', p.id, p);
}

export async function saveFile(id: string, name: string, bytes: Uint8Array): Promise<void> {
  await db.put('files', id, { name, bytes: new Blob([bytes as BlobPart]) });
}

export async function loadFile(id: string): Promise<{ name: string; bytes: Uint8Array } | undefined> {
  const rec = await db.get<{ name: string; bytes: Blob }>('files', id);
  if (!rec) return undefined;
  return { name: rec.name, bytes: new Uint8Array(await rec.bytes.arrayBuffer()) };
}

export async function deleteProject(id: string): Promise<void> {
  await db.delete('projects', id);
  await db.delete('files', id);
}

/** Debounced saver: coalesces frequent updates (camera moves) into one write. */
export class ProjectSaver {
  private timer = 0;
  private deadline = 0;
  private pending: ProjectState | null = null;

  /** Saves `p` after `delay` ms. An earlier pending deadline is never postponed. */
  schedule(p: ProjectState, delay = 300): void {
    this.pending = p;
    const due = performance.now() + delay;
    if (this.timer && this.deadline <= due) return;
    clearTimeout(this.timer);
    this.deadline = due;
    this.timer = window.setTimeout(() => this.flush(), delay);
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.pending) {
      void saveProject(this.pending);
      this.pending = null;
    }
  }
}
