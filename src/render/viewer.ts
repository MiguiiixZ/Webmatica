/**
 * The 3D viewer: owns the WebGL renderer, camera, controls and chunk meshes.
 *
 * Rendering is strictly on demand: a frame is drawn only when something
 * changed (camera, layer, settings, a mesh arrived). Nothing runs while the
 * tab is hidden.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataArrayTexture,
  DataTexture,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  GLSL3,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  NearestFilter,
  NearestMipmapLinearFilter,
  PerspectiveCamera,
  RawShaderMaterial,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  Sphere,
  UnsignedByteType,
  Vector2,
  Vector3,
  Euler,
  WebGLRenderer,
  DoubleSide,
  FrontSide,
  Raycaster,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Schematic } from '../parser/types';
import type { CompileResult, RenderTables } from './blockTables';
import { FLAG_EMPTY } from './blockTables';
import { MESH_UNIT, nonEmptyChunks, type Clip, type MeshRegion } from './mesher';
import { chunkFragmentShader, chunkVertexShader } from './shaders';
import { buildLayerData, type TexturePack } from './texturePack';
import { visibleRange, type CameraState, type LayerState, type RenderSettings, type ViewTransform } from './viewState';
import type { MeshRequest, MeshResponse } from '../workers/meshProtocol';
import MeshWorker from '../workers/mesh.worker.ts?worker';

export interface PickResult {
  /** Block position in schematic coordinates. */
  pos: [number, number, number];
  /** Normal of the face that was hit (in schematic coordinates). */
  normal: [number, number, number];
  paletteId: number;
  region: number;
}

export interface ViewerMetrics {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometryBytes: number;
  textureBytes: number;
  chunksShown: number;
  chunksTotal: number;
  pendingJobs: number;
  lastMeshMs: number;
  /** Wall time of the last complete (re)meshing pass. */
  fullMeshMs: number;
  /** True when far chunks are hidden to stay within the memory budget. */
  distanceLimited: boolean;
}

interface CachedMesh {
  solid: Mesh | null;
  translucent: Mesh | null;
  bytes: number;
  lastUsed: number;
}

interface ChunkSlot {
  index: number;
  cx: number;
  cy: number;
  cz: number;
  shownKey: string | null;
  wantKey: string;
  requestedKey: string | null;
}

interface Job {
  id: number;
  chunk: ChunkSlot;
  key: string;
  clip: Clip | null;
  generation: number;
}

const CACHE_BUDGET = 96 * 1024 * 1024;
/** GPU memory for visible chunk meshes before the automatic render distance kicks in. */
const GPU_BUDGET = 256 * 1024 * 1024;
const GPU_BUDGET_LOW = 128 * 1024 * 1024;
const MAX_MESH_UNITS = 1500;
const MAX_MESH_UNITS_LOW = 700;

function releaseArray(this: BufferAttribute): void {
  (this as unknown as { array: ArrayLike<number> | null }).array = null;
}
const MAX_INFLIGHT_PER_WORKER = 4;

export class Viewer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.05, 4000);
  private readonly group = new Group();
  private readonly chunkGroup = new Group();
  private readonly controls: OrbitControls;
  private readonly solidMat: RawShaderMaterial;
  private readonly translucentMat: RawShaderMaterial;
  private readonly hoverBox: LineSegments;
  private readonly measureLine: LineSegments;
  private readonly boundsBox: LineSegments;
  private quadIndex: BufferAttribute;
  private quadIndexCapacity = 0;

  private schematic: Schematic | null = null;
  private tables: RenderTables | null = null;
  private regions: MeshRegion[] = [];
  private regionVisible: boolean[] = [];
  private chunks: ChunkSlot[] = [];
  private chunkDims: [number, number, number] = [0, 0, 0];
  private readonly cache = new Map<string, CachedMesh>();
  private cacheBytes = 0;
  private generation = 0;
  private workers: Worker[] = [];
  private inflight: number[] = [];
  private queue: Job[] = [];
  private readonly jobs = new Map<number, Job>();
  private nextJobId = 1;
  private lastMeshMs = 0;

  private clip: Clip | null = null;
  private settings: RenderSettings;
  private transform: ViewTransform = { rotation: 0, mirrorX: false, mirrorZ: false };
  private readonly worldToLocal = new Matrix4();
  private highlightTex: DataTexture;
  private appTex: DataTexture;
  private texArray: DataArrayTexture;
  private textureBytes = 0;

  private mode: 'orbit' | 'fly' = 'orbit';
  private readonly keys = new Set<string>();
  private flySpeed = 12;
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private lastPointer = new Vector2();

  private frameRequested = false;
  private rafHandle = 0;
  private timerHandle = 0;
  private lastFrameTime = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private frameMs = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  private readonly onVisibility = () => {
    if (document.hidden) this.pause();
    else this.requestRender();
  };

  /** Called after every rendered frame (for metrics) and whenever the camera moves. */
  onFrame: (() => void) | null = null;
  onCameraChange: (() => void) | null = null;
  /** Camera heading in degrees clockwise from north (-Z), reported only when it changes. */
  onHeading: ((deg: number) => void) | null = null;
  private lastHeading = NaN;
  private readonly headingEuler = new Euler(0, 0, 0, 'YXZ');
  onMeshProgress: ((pending: number, total: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, settings: RenderSettings) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.renderer.setClearColor(new Color(0x15171c), 1);
    this.renderer.sortObjects = true;
    this.scene.add(this.group);
    this.group.add(this.chunkGroup);
    this.group.matrixAutoUpdate = false;

    this.highlightTex = new DataTexture(new Uint8Array(256), 256, 1, RedFormat, UnsignedByteType);
    this.highlightTex.needsUpdate = true;
    this.appTex = new DataTexture(new Uint8Array(512 * 4), 512, 1, RGBAFormat, UnsignedByteType);
    this.appTex.needsUpdate = true;
    this.texArray = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);
    this.texArray.needsUpdate = true;

    const uniforms = () => ({
      uWorldToLocal: { value: this.worldToLocal },
      uApp: { value: this.appTex },
      uTex: { value: this.texArray },
      uHighlight: { value: this.highlightTex },
      uTextured: { value: false },
      uHighlightOn: { value: false },
      uAxis: { value: 1 },
      uMin: { value: -1e9 },
      uMax: { value: 1e9 },
      uCur: { value: 0 },
      uNext: { value: -1e9 },
      uDimBelow: { value: false },
      uHiCur: { value: false },
      uHiNext: { value: false },
      uAlpha: { value: 1 },
      uGrid: { value: false },
      uTranslucentPass: { value: 0 },
    });
    this.solidMat = new RawShaderMaterial({
      vertexShader: chunkVertexShader,
      fragmentShader: chunkFragmentShader,
      glslVersion: GLSL3,
      uniforms: uniforms(),
      side: FrontSide,
    });
    this.translucentMat = new RawShaderMaterial({
      vertexShader: chunkVertexShader,
      fragmentShader: chunkFragmentShader,
      glslVersion: GLSL3,
      uniforms: { ...uniforms(), uTranslucentPass: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    // Share uniform objects so updates apply to both materials.
    for (const k of Object.keys(this.solidMat.uniforms)) {
      if (k !== 'uTranslucentPass') this.translucentMat.uniforms[k] = this.solidMat.uniforms[k];
    }

    this.quadIndex = new BufferAttribute(new Uint32Array(0), 1);
    this.ensureQuadIndex(16384);

    const edges = new EdgesGeometry(new BoxGeometry(1.01, 1.01, 1.01));
    this.hoverBox = new LineSegments(edges, new LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.hoverBox.visible = false;
    this.hoverBox.renderOrder = 10;
    this.group.add(this.hoverBox);
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    this.measureLine = new LineSegments(lineGeo, new LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }));
    this.measureLine.visible = false;
    this.measureLine.renderOrder = 11;
    this.group.add(this.measureLine);
    this.boundsBox = new LineSegments(new EdgesGeometry(new BoxGeometry(1, 1, 1)), new LineBasicMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.35 }));
    this.group.add(this.boundsBox);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => {
      this.requestRender();
      this.scheduleDistanceRefresh();
      this.onCameraChange?.();
    });

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.applySettings();
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  load(schematic: Schematic, compiled: CompileResult, pack: TexturePack | null, regionVisible: boolean[]): void {
    this.clearMeshes();
    this.stopWorkers();
    this.schematic = schematic;
    this.tables = compiled.tables;
    this.regions = schematic.regions.map((r) => ({ offset: r.offset, volume: r.volume }));
    this.regionVisible = regionVisible.slice();
    this.chunkDims = [Math.ceil(schematic.size[0] / MESH_UNIT), Math.ceil(schematic.size[1] / MESH_UNIT), Math.ceil(schematic.size[2] / MESH_UNIT)];
    this.meshedBytes = 0;
    this.meshedCount = 0;
    this.setAppearances(compiled, pack);
    this.setHighlight(null);
    this.updateTransform();
    const [sx, sy, sz] = schematic.size;
    this.boundsBox.scale.set(sx, sy, sz);
    this.boundsBox.position.set(sx / 2, sy / 2, sz / 2);
    this.startWorkers();
    this.rebuildChunkList();
    this.resetCamera();
    this.refreshChunks();
  }

  /** Replaces block tables (e.g. after loading a new texture pack with real models). */
  setTables(compiled: CompileResult, pack: TexturePack | null): void {
    this.tables = compiled.tables;
    this.setAppearances(compiled, pack);
    for (const w of this.workers) this.post(w, { type: 'tables', tables: compiled.tables });
    this.invalidateMeshes();
  }

  private setAppearances(compiled: CompileResult, pack: TexturePack | null): void {
    const list = compiled.registry.list;
    const rows = Math.max(1, Math.ceil(list.length / 256));
    const app = new Uint8Array(512 * rows * 4);
    let textured: boolean[] = list.map(() => false);
    this.texArray.dispose();
    if (pack) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
      const built = buildLayerData(pack, list, maxLayers);
      textured = built.textured.concat(list.slice(built.layers).map(() => false));
      const tex = new DataArrayTexture(built.data, built.size, built.size, built.layers);
      tex.format = RGBAFormat;
      tex.type = UnsignedByteType;
      tex.magFilter = NearestFilter;
      tex.minFilter = NearestMipmapLinearFilter;
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      this.texArray = tex;
      this.textureBytes = built.data.byteLength * 1.34;
    } else {
      this.texArray = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);
      this.texArray.needsUpdate = true;
      this.textureBytes = 0;
    }
    list.forEach((a, i) => {
      const o = ((i >> 8) * 512 + (i & 255) * 2) * 4;
      app[o] = (a.color >>> 24) & 255;
      app[o + 1] = (a.color >>> 16) & 255;
      app[o + 2] = (a.color >>> 8) & 255;
      app[o + 3] = a.color & 255;
      app[o + 4] = textured[i] ? 255 : 0;
    });
    this.appTex.dispose();
    this.appTex = new DataTexture(app, 512, rows, RGBAFormat, UnsignedByteType);
    this.appTex.needsUpdate = true;
    this.solidMat.uniforms.uApp.value = this.appTex;
    this.solidMat.uniforms.uTex.value = this.texArray;
    this.requestRender();
  }

  // -------------------------------------------------------------------------
  // Workers and chunk meshes
  // -------------------------------------------------------------------------

  private startWorkers(): void {
    if (!this.schematic || !this.tables) return;
    const bytes = this.schematic.regions.reduce((s, r) => s + r.volume.byteSize, 0);
    const shared = typeof SharedArrayBuffer !== 'undefined' && this.schematic.regions[0]?.volume.data.buffer instanceof SharedArrayBuffer;
    const cores = navigator.hardwareConcurrency || 2;
    // Without shared memory every worker holds a copy of the blocks: use fewer workers for big schematics.
    let count = Math.max(1, Math.min(3, cores - 1));
    if (!shared && bytes > 48 * 1024 * 1024) count = 1;
    const init: MeshRequest = {
      type: 'init',
      regions: this.schematic.regions.map((r) => ({ offset: r.offset, volume: r.volume.toData() })),
      tables: this.tables,
      ao: this.settings.ao,
    };
    for (let i = 0; i < count; i++) {
      const w = new MeshWorker();
      w.onmessage = (e: MessageEvent<MeshResponse>) => this.onWorkerMessage(i, e.data);
      w.onerror = (e) => console.error('Mesh worker error', e.message);
      this.post(w, init);
      this.workers.push(w);
      this.inflight.push(0);
    }
  }

  private stopWorkers(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.inflight = [];
    this.queue = [];
    this.jobs.clear();
  }

  private post(w: Worker, m: MeshRequest): void {
    w.postMessage(m);
  }

  private rebuildChunkList(): void {
    if (!this.schematic) return;
    const visibleRegions = this.regions.filter((_, i) => this.regionVisible[i]);
    const nonEmpty = nonEmptyChunks(visibleRegions, this.schematic.size);
    const [cx, cy, cz] = this.chunkDims;
    this.chunks = [];
    for (let y = 0; y < cy; y++)
      for (let z = 0; z < cz; z++)
        for (let x = 0; x < cx; x++) {
          const index = (y * cz + z) * cx + x;
          if (!nonEmpty[index]) continue;
          this.chunks.push({ index, cx: x, cy: y, cz: z, shownKey: null, wantKey: 'F', requestedKey: null });
        }
  }

  /** Key describing how a chunk must be meshed for the current clip ('F' = unclipped, 'E' = nothing visible). */
  private keyFor(c: ChunkSlot): { key: string; clip: Clip | null } {
    const clip = this.clip;
    if (!clip) return { key: 'F', clip: null };
    const origin = [c.cx, c.cy, c.cz][clip.axis] * MESH_UNIT;
    const lo = Math.max(-1, Math.min(MESH_UNIT + 1, clip.min - origin));
    const hi = Math.max(-2, Math.min(MESH_UNIT, clip.max - origin));
    if (lo > MESH_UNIT - 1 || hi < 0 || lo > hi) return { key: 'E', clip: null };
    if (lo <= -1 && hi >= MESH_UNIT) return { key: 'F', clip: null };
    return { key: `${clip.axis}:${lo}:${hi}`, clip: { axis: clip.axis, min: origin + lo, max: origin + hi } };
  }

  private cacheKey(c: ChunkSlot, key: string): string {
    return `${c.index}/${key}`;
  }

  /**
   * Decides which mesh every chunk should show and schedules the missing ones.
   * Chunks are processed nearest-first; once the GPU memory or chunk budget is
   * used up, farther chunks are hidden (an automatic render distance), which
   * keeps very large schematics within bounded memory.
   */
  private refreshChunks(): void {
    if (!this.schematic) return;
    const now = performance.now();
    this.queue = [];
    const camPos = this.cameraLocalPosition();
    const list: { c: ChunkSlot; key: string; clip: Clip | null; dist: number }[] = [];
    for (const c of this.chunks) {
      const { key, clip } = this.keyFor(c);
      c.wantKey = key;
      if (key === 'E') {
        this.showChunk(c, null);
        continue;
      }
      const dx = c.cx * MESH_UNIT + MESH_UNIT / 2 - camPos.x;
      const dy = c.cy * MESH_UNIT + MESH_UNIT / 2 - camPos.y;
      const dz = c.cz * MESH_UNIT + MESH_UNIT / 2 - camPos.z;
      list.push({ c, key, clip, dist: dx * dx + dy * dy + dz * dz });
    }
    list.sort((a, b) => a.dist - b.dist);
    const budget = this.settings.lowPower ? GPU_BUDGET_LOW : GPU_BUDGET;
    const maxChunks = this.settings.lowPower ? MAX_MESH_UNITS_LOW : MAX_MESH_UNITS;
    const avg = this.meshedCount ? this.meshedBytes / this.meshedCount : 256 * 1024;
    let used = 0;
    let count = 0;
    let limited = false;
    for (const w of list) {
      const cached = this.cache.get(this.cacheKey(w.c, w.key));
      const size = cached ? cached.bytes : avg;
      if (count > 0 && (used + size > budget || count >= maxChunks)) {
        limited = true;
        w.c.wantKey = 'E';
        this.showChunk(w.c, null);
        continue;
      }
      used += size;
      count++;
      if (cached) {
        cached.lastUsed = now;
        this.showChunk(w.c, w.key);
      } else if (w.c.requestedKey !== w.key) {
        this.queue.push({ id: 0, chunk: w.c, key: w.key, clip: w.clip, generation: this.generation });
      }
    }
    this.budgetLimited = limited;
    this.pump();
    this.evictCache();
    this.requestRender();
  }

  /** True when some chunks are hidden because of the memory budget. */
  private budgetLimited = false;
  private meshedBytes = 0;
  private meshedCount = 0;
  private distanceTimer = 0;

  /** Re-evaluates the render distance after the camera stops moving. */
  private scheduleDistanceRefresh(): void {
    if (!this.budgetLimited) return;
    clearTimeout(this.distanceTimer);
    this.distanceTimer = window.setTimeout(() => this.refreshChunks(), 250);
  }

  private meshStart = 0;
  private lastFullMeshMs = 0;

  private pump(): void {
    if (!this.workers.length) return;
    if (this.queue.length && !this.meshStart && this.jobs.size === 0) this.meshStart = performance.now();
    while (this.queue.length) {
      let best = -1;
      for (let i = 0; i < this.workers.length; i++) {
        if (this.inflight[i] < MAX_INFLIGHT_PER_WORKER && (best < 0 || this.inflight[i] < this.inflight[best])) best = i;
      }
      if (best < 0) break;
      const job = this.queue.shift()!;
      if (job.chunk.wantKey !== job.key) continue;
      job.id = this.nextJobId++;
      job.chunk.requestedKey = job.key;
      this.jobs.set(job.id, job);
      this.inflight[best]++;
      this.post(this.workers[best], {
        type: 'mesh',
        id: job.id,
        cx: job.chunk.cx,
        cy: job.chunk.cy,
        cz: job.chunk.cz,
        visible: this.regionVisible,
        clip: job.clip,
      });
    }
    this.onMeshProgress?.(this.queue.length + this.jobs.size, this.chunks.length);
  }

  private onWorkerMessage(worker: number, msg: MeshResponse): void {
    if (this.disposed) return;
    this.inflight[worker] = Math.max(0, this.inflight[worker] - 1);
    const job = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    if (job) {
      if (job.chunk.requestedKey === job.key) job.chunk.requestedKey = null;
      if (msg.type === 'meshed' && job.generation === this.generation) {
        this.lastMeshMs = msg.ms;
        const entry = this.createMeshes(job.chunk, msg.solid, msg.translucent);
        this.meshedBytes += entry.bytes;
        this.meshedCount++;
        const ck = this.cacheKey(job.chunk, job.key);
        const old = this.cache.get(ck);
        if (old) this.disposeEntry(old);
        this.cache.set(ck, entry);
        this.cacheBytes += entry.bytes;
        if (job.chunk.wantKey === job.key) this.showChunk(job.chunk, job.key);
        this.requestRenderSoon();
      } else if (msg.type === 'error') {
        console.error('Meshing failed:', msg.message);
      }
    }
    this.pump();
    if (this.queue.length === 0 && this.jobs.size === 0) {
      if (this.meshStart) {
        this.lastFullMeshMs = performance.now() - this.meshStart;
        this.meshStart = 0;
      }
      this.dropAllStale();
      this.evictCache();
      this.requestRender();
    }
  }

  private ensureQuadIndex(quads: number): void {
    if (quads <= this.quadIndexCapacity) return;
    let cap = Math.max(16384, this.quadIndexCapacity);
    while (cap < quads) cap *= 2;
    const idx = new Uint32Array(cap * 6);
    for (let q = 0, v = 0, i = 0; q < cap; q++, v += 4) {
      idx[i++] = v;
      idx[i++] = v + 1;
      idx[i++] = v + 2;
      idx[i++] = v;
      idx[i++] = v + 2;
      idx[i++] = v + 3;
    }
    this.quadIndex = new BufferAttribute(idx, 1);
    this.quadIndexCapacity = cap;
    // Re-point existing geometries at the bigger shared index buffer.
    for (const e of this.cache.values()) {
      e.solid?.geometry.setIndex(this.quadIndex);
      e.translucent?.geometry.setIndex(this.quadIndex);
    }
  }

  private createMeshes(c: ChunkSlot, solid: Uint32Array, translucent: Uint32Array): CachedMesh {
    const make = (data: Uint32Array, mat: RawShaderMaterial, order: number): Mesh | null => {
      if (data.length === 0) return null;
      const quads = data.length / 12;
      this.ensureQuadIndex(quads);
      const geo = new BufferGeometry();
      const attr = new BufferAttribute(data, 3);
      // The GPU keeps the data; drop the JavaScript copy once uploaded to halve memory use.
      attr.onUpload(releaseArray);
      geo.setAttribute('aData', attr);
      geo.setIndex(this.quadIndex);
      geo.setDrawRange(0, quads * 6);
      geo.boundingSphere = new Sphere(new Vector3(MESH_UNIT / 2, MESH_UNIT / 2, MESH_UNIT / 2), (MESH_UNIT * Math.sqrt(3)) / 2 + 0.1);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(c.cx * MESH_UNIT, c.cy * MESH_UNIT, c.cz * MESH_UNIT);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = order;
      return mesh;
    };
    return {
      solid: make(solid, this.solidMat, 0),
      translucent: make(translucent, this.translucentMat, 1),
      bytes: solid.byteLength + translucent.byteLength,
      lastUsed: performance.now(),
    };
  }

  private showChunk(c: ChunkSlot, key: string | null): void {
    if (c.shownKey === key) return;
    if (c.shownKey) {
      const old = this.cache.get(this.cacheKey(c, c.shownKey));
      if (old) {
        if (old.solid) this.chunkGroup.remove(old.solid);
        if (old.translucent) this.chunkGroup.remove(old.translucent);
      }
    }
    c.shownKey = null;
    if (key) {
      const e = this.cache.get(this.cacheKey(c, key));
      if (e) {
        if (e.solid) this.chunkGroup.add(e.solid);
        if (e.translucent) this.chunkGroup.add(e.translucent);
        e.lastUsed = performance.now();
        c.shownKey = key;
        this.dropStale(c);
      }
    } else {
      this.dropStale(c);
    }
  }

  private disposeEntry(e: CachedMesh, counted = true): void {
    for (const m of [e.solid, e.translucent]) {
      if (!m) continue;
      this.chunkGroup.remove(m);
      // Keep the shared index buffer alive: detach it before disposing.
      m.geometry.setIndex(null);
      m.geometry.dispose();
    }
    if (counted) this.cacheBytes -= e.bytes;
  }

  private evictCache(): void {
    if (this.cacheBytes <= CACHE_BUDGET) return;
    const shown = new Set(this.chunks.filter((c) => c.shownKey).map((c) => this.cacheKey(c, c.shownKey!)));
    const entries = [...this.cache.entries()].filter(([k]) => !shown.has(k)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [k, e] of entries) {
      if (this.cacheBytes <= CACHE_BUDGET * 0.8) break;
      this.disposeEntry(e);
      this.cache.delete(k);
    }
  }

  private clearMeshes(): void {
    this.dropAllStale();
    for (const e of this.cache.values()) this.disposeEntry(e);
    this.cache.clear();
    this.cacheBytes = 0;
    for (const c of this.chunks) c.shownKey = null;
    this.chunkGroup.clear();
  }

  /** Drops every cached mesh and re-meshes (after tables or AO changes). */
  private invalidateMeshes(): void {
    this.generation++;
    // Meshes on screen stay visible (as "stale") until their replacement arrives.
    for (const c of this.chunks) {
      if (!c.shownKey) continue;
      const k = this.cacheKey(c, c.shownKey);
      const e = this.cache.get(k);
      if (e) {
        this.cache.delete(k);
        this.cacheBytes -= e.bytes;
        this.stale.set(c, e);
      }
      c.shownKey = null;
    }
    for (const e of this.cache.values()) this.disposeEntry(e);
    this.cache.clear();
    for (const c of this.chunks) c.requestedKey = null;
    this.jobs.clear();
    this.inflight = this.inflight.map(() => 0);
    this.refreshChunks();
  }

  private readonly stale = new Map<ChunkSlot, CachedMesh>();

  private dropStale(c: ChunkSlot): void {
    const e = this.stale.get(c);
    if (!e) return;
    this.stale.delete(c);
    this.disposeEntry(e, false);
  }

  private dropAllStale(): void {
    for (const c of [...this.stale.keys()]) this.dropStale(c);
  }

  setRegionVisibility(visible: boolean[]): void {
    this.regionVisible = visible.slice();
    this.clearMeshes();
    this.generation++;
    this.jobs.clear();
    this.inflight = this.inflight.map(() => 0);
    this.rebuildChunkList();
    this.refreshChunks();
  }

  // -------------------------------------------------------------------------
  // View state
  // -------------------------------------------------------------------------

  setLayer(layer: LayerState, nextLayer: number | null): void {
    if (!this.schematic) return;
    const len = this.schematic.size[layer.axis];
    const [min, max] = visibleRange(layer, len);
    const prev = this.clip;
    this.clip = layer.mode === 'all' ? null : { axis: layer.axis, min, max };
    const u = this.solidMat.uniforms;
    u.uAxis.value = layer.axis;
    u.uMin.value = this.clip ? min : -1e9;
    u.uMax.value = this.clip ? max : 1e9;
    u.uCur.value = Math.min(Math.max(0, layer.current), len - 1);
    u.uNext.value = nextLayer ?? -1e9;
    // Dimming and highlights only apply when a layer is chosen (not in "All layers").
    u.uDimBelow.value = layer.dimBelow && layer.mode !== 'single' && layer.mode !== 'all';
    u.uHiCur.value = layer.highlightCurrent && layer.mode !== 'all';
    u.uHiNext.value = layer.highlightNext && nextLayer !== null;
    const changed = !prev !== !this.clip || (prev && this.clip && (prev.axis !== this.clip.axis || prev.min !== this.clip.min || prev.max !== this.clip.max));
    if (changed) this.refreshChunks();
    else this.requestRender();
  }

  setHighlight(paletteIds: Set<number> | null): void {
    const n = this.tables?.paletteSize ?? 1;
    const rows = Math.max(1, Math.ceil(n / 256));
    const data = new Uint8Array(256 * rows);
    if (paletteIds) for (const id of paletteIds) if (id < data.length) data[id] = 255;
    this.highlightTex.dispose();
    this.highlightTex = new DataTexture(data, 256, rows, RedFormat, UnsignedByteType);
    this.highlightTex.needsUpdate = true;
    this.solidMat.uniforms.uHighlight.value = this.highlightTex;
    this.solidMat.uniforms.uHighlightOn.value = !!paletteIds && paletteIds.size > 0;
    this.requestRender();
  }

  setSettings(s: RenderSettings): void {
    const aoChanged = s.ao !== this.settings.ao;
    const resChanged = s.lowPower !== this.settings.lowPower || s.maxDpr !== this.settings.maxDpr;
    this.settings = { ...s };
    this.applySettings();
    if (resChanged) {
      this.resize();
      this.refreshChunks();
    }
    if (aoChanged) {
      for (const w of this.workers) this.post(w, { type: 'options', ao: s.ao });
      this.invalidateMeshes();
    }
  }

  private applySettings(): void {
    const s = this.settings;
    const u = this.solidMat.uniforms;
    u.uTextured.value = s.textured;
    u.uGrid.value = s.grid;
    u.uAlpha.value = s.ghost ? s.ghostOpacity : 1;
    this.solidMat.transparent = s.ghost;
    this.solidMat.needsUpdate = true;
    this.translucentMat.uniforms.uAlpha = u.uAlpha;
    this.requestRender();
  }

  setTransform(t: ViewTransform): void {
    this.transform = { ...t };
    this.updateTransform();
    this.requestRender();
  }

  private updateTransform(): void {
    if (!this.schematic) return;
    const [sx, sy, sz] = this.schematic.size;
    const c = new Vector3(sx / 2, sy / 2, sz / 2);
    const m = new Matrix4().makeTranslation(c.x, c.y, c.z);
    m.multiply(new Matrix4().makeRotationY((-this.transform.rotation * Math.PI) / 2));
    m.multiply(new Matrix4().makeScale(this.transform.mirrorX ? -1 : 1, 1, this.transform.mirrorZ ? -1 : 1));
    m.multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    this.group.matrix.copy(m);
    this.group.updateMatrixWorld(true);
    this.worldToLocal.copy(this.group.matrixWorld).invert();
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  resetCamera(): void {
    if (!this.schematic) return;
    const [sx, sy, sz] = this.schematic.size;
    const r = Math.max(4, Math.hypot(sx, sy, sz) / 2);
    const target = new Vector3(sx / 2, sy / 3, sz / 2);
    this.camera.far = Math.max(500, r * 12);
    this.camera.near = Math.max(0.05, r / 2000);
    this.camera.updateProjectionMatrix();
    const dist = r / Math.tan((this.camera.fov * Math.PI) / 360) * 1.05;
    const dir = new Vector3(1, 0.8, 1.25).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.syncFlyAngles();
    this.flySpeed = Math.max(6, r / 3);
    this.requestRender();
  }

  getCameraState(): CameraState {
    return {
      mode: this.mode,
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
    };
  }

  setCameraState(s: CameraState): void {
    this.camera.position.fromArray(s.position);
    this.controls.target.fromArray(s.target);
    this.camera.lookAt(this.controls.target);
    this.setCameraMode(s.mode);
    if (s.mode === 'orbit') this.controls.update();
    this.requestRender();
  }

  setCameraMode(mode: 'orbit' | 'fly'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'fly') this.syncFlyAngles();
    else {
      // Re-target the orbit to a point in front of the camera.
      const dir = new Vector3();
      this.camera.getWorldDirection(dir);
      const d = this.camera.position.distanceTo(this.controls.target);
      this.controls.target.copy(this.camera.position).addScaledVector(dir, Math.max(2, Math.min(d, 200)));
      this.controls.update();
    }
    this.onCameraChange?.();
    this.requestRender();
  }

  get cameraMode(): 'orbit' | 'fly' {
    return this.mode;
  }

  private syncFlyAngles(): void {
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  }

  private applyFlyRotation(): void {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private cameraLocalPosition(): Vector3 {
    return this.camera.position.clone().applyMatrix4(this.worldToLocal);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode !== 'fly') return;
    this.dragging = true;
    this.lastPointer.set(e.clientX, e.clientY);
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.mode !== 'fly' || !this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.004));
    this.applyFlyRotation();
    this.requestRender();
    this.onCameraChange?.();
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'fly') return;
    e.preventDefault();
    this.flySpeed = Math.max(1, Math.min(400, this.flySpeed * (e.deltaY > 0 ? 0.85 : 1.18)));
  };

  private static readonly FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE']);

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'fly' || !Viewer.FLY_KEYS.has(e.code)) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.code === 'Space') e.preventDefault();
    if (!this.keys.has(e.code)) {
      this.keys.add(e.code);
      this.lastFrameTime = performance.now();
      this.requestRender();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.dragging = false;
  };

  private updateFly(dt: number): boolean {
    if (this.mode !== 'fly' || this.keys.size === 0) return false;
    const fwd = new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const move = new Vector3();
    if (this.keys.has('KeyW')) move.add(fwd);
    if (this.keys.has('KeyS')) move.sub(fwd);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);
    if (this.keys.has('Space') || this.keys.has('KeyE')) move.y += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() === 0) return false;
    move.normalize().multiplyScalar(this.flySpeed * Math.min(dt, 0.1));
    this.camera.position.add(move);
    this.applyFlyRotation();
    this.scheduleDistanceRefresh();
    this.onCameraChange?.();
    return true;
  }

  // -------------------------------------------------------------------------
  // Picking and overlays
  // -------------------------------------------------------------------------

  /** Block id at schematic coordinates, considering visible regions (last region wins). */
  blockAt(x: number, y: number, z: number): { id: number; region: number } {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      if (!this.regionVisible[i]) continue;
      const { offset, volume } = this.regions[i];
      const lx = x - offset[0];
      const ly = y - offset[1];
      const lz = z - offset[2];
      if (lx < 0 || ly < 0 || lz < 0 || lx >= volume.sx || ly >= volume.sy || lz >= volume.sz) continue;
      const id = volume.get(lx, ly, lz);
      if (id) return { id, region: i };
    }
    return { id: 0, region: -1 };
  }

  /** Casts a ray from screen coordinates (CSS pixels relative to the canvas) through the voxel grid. */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.schematic || !this.tables) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const o = rc.ray.origin.clone().applyMatrix4(this.worldToLocal);
    const d = rc.ray.direction.clone().transformDirection(this.worldToLocal).normalize();
    const [sx, sy, sz] = this.schematic.size;
    // Clip the ray to the schematic box.
    let t0 = 0;
    let t1 = 1e9;
    const lo = [0, 0, 0];
    const hi = [sx, sy, sz];
    const oa = [o.x, o.y, o.z];
    const da = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(da[i]) < 1e-12) {
        if (oa[i] < lo[i] || oa[i] > hi[i]) return null;
        continue;
      }
      let a = (lo[i] - oa[i]) / da[i];
      let b = (hi[i] - oa[i]) / da[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t0 > t1) return null;
    const start = [oa[0] + da[0] * (t0 + 1e-6), oa[1] + da[1] * (t0 + 1e-6), oa[2] + da[2] * (t0 + 1e-6)];
    const cell = start.map((v, i) => Math.min(hi[i] - 1, Math.max(0, Math.floor(v))));
    const step = da.map((v) => (v > 0 ? 1 : -1));
    const tDelta = da.map((v) => (Math.abs(v) < 1e-12 ? Infinity : Math.abs(1 / v)));
    const tMax = da.map((v, i) => {
      if (Math.abs(v) < 1e-12) return Infinity;
      const next = v > 0 ? cell[i] + 1 : cell[i];
      return (next - start[i]) / v;
    });
    let normal: [number, number, number] = [0, 0, 0];
    // Entry face normal
    const entryAxis = [0, 1, 2].reduce((best, i) => {
      if (Math.abs(da[i]) < 1e-12) return best;
      const a = ((da[i] > 0 ? lo[i] : hi[i]) - oa[i]) / da[i];
      return Math.abs(a - t0) < 1e-6 ? i : best;
    }, -1);
    if (entryAxis >= 0) normal[entryAxis] = -step[entryAxis];
    const clip = this.clip;
    for (let i = 0; i < sx + sy + sz + 3; i++) {
      const [x, y, z] = cell;
      if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) break;
      const inClip = !clip || (cell[clip.axis] >= clip.min && cell[clip.axis] <= clip.max);
      if (inClip) {
        const { id, region } = this.blockAt(x, y, z);
        if (id && !(this.tables.flags[id] & FLAG_EMPTY)) {
          return { pos: [x, y, z], normal, paletteId: id, region };
        }
      }
      let axis = 0;
      if (tMax[1] < tMax[axis]) axis = 1;
      if (tMax[2] < tMax[axis]) axis = 2;
      cell[axis] += step[axis];
      tMax[axis] += tDelta[axis];
      normal = [0, 0, 0];
      normal[axis] = -step[axis];
    }
    return null;
  }

  setHover(pos: [number, number, number] | null): void {
    if (!pos) {
      if (this.hoverBox.visible) {
        this.hoverBox.visible = false;
        this.requestRender();
      }
      return;
    }
    this.hoverBox.visible = true;
    this.hoverBox.position.set(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
    this.requestRender();
  }

  setMeasure(a: [number, number, number] | null, b: [number, number, number] | null): void {
    if (!a || !b) {
      this.measureLine.visible = false;
    } else {
      const attr = this.measureLine.geometry.getAttribute('position') as BufferAttribute;
      attr.setXYZ(0, a[0] + 0.5, a[1] + 0.5, a[2] + 0.5);
      attr.setXYZ(1, b[0] + 0.5, b[1] + 0.5, b[2] + 0.5);
      attr.needsUpdate = true;
      this.measureLine.geometry.computeBoundingSphere();
      this.measureLine.visible = true;
    }
    this.requestRender();
  }

  // -------------------------------------------------------------------------
  // Render loop
  // -------------------------------------------------------------------------

  /** Renders at most every ~120 ms while chunks stream in (avoids one frame per chunk). */
  private requestRenderSoon(): void {
    if (this.soonTimer) return;
    this.soonTimer = window.setTimeout(() => {
      this.soonTimer = 0;
      this.requestRender();
    }, 120);
  }

  private soonTimer = 0;

  requestRender(): void {
    if (this.disposed || this.frameRequested) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.frameRequested = true;
    const minInterval = this.settings.lowPower ? 1000 / 30 : 0;
    const wait = minInterval - (performance.now() - this.lastFrameTime);
    if (wait > 1) {
      this.timerHandle = window.setTimeout(() => {
        this.rafHandle = requestAnimationFrame(this.frame);
      }, wait);
    } else {
      this.rafHandle = requestAnimationFrame(this.frame);
    }
  }

  private pause(): void {
    cancelAnimationFrame(this.rafHandle);
    clearTimeout(this.timerHandle);
    this.frameRequested = false;
    this.keys.clear();
    this.dragging = false;
  }

  /** Heading for the compass: north is -Z in the scene (the game's world axes, also after rotate/mirror). */
  getHeading(): number {
    this.headingEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const deg = (-this.headingEuler.y * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
  }

  private reportHeading(): void {
    if (!this.onHeading) return;
    const h = this.getHeading();
    if (Math.abs(h - this.lastHeading) < 0.2) return;
    this.lastHeading = h;
    this.onHeading(h);
  }

  private frame = (time: number) => {
    this.frameRequested = false;
    if (this.disposed) return;
    const dt = this.lastFrameTime ? (time - this.lastFrameTime) / 1000 : 0;
    const moving = this.updateFly(dt);
    this.lastFrameTime = time;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
    this.fpsFrames++;
    if (time - this.fpsTime > 500) {
      this.fps = (this.fpsFrames * 1000) / (time - this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = time;
    }
    this.onFrame?.();
    this.reportHeading();
    if (moving) this.requestRender();
    else {
      // Throttled re-prioritization of chunk meshing while the camera moves.
      if (this.queue.length) this.pump();
    }
  };

  private resize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent ? parent.clientWidth : this.canvas.clientWidth);
    const h = Math.max(1, parent ? parent.clientHeight : this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.maxDpr) * (this.settings.lowPower ? 0.75 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  metrics(): ViewerMetrics {
    const info = this.renderer.info;
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometryBytes: this.cacheBytes + this.quadIndexCapacity * 24,
      textureBytes: this.textureBytes,
      chunksShown: this.chunks.filter((c) => c.shownKey).length,
      chunksTotal: this.chunks.length,
      pendingJobs: this.queue.length + this.jobs.size,
      lastMeshMs: this.lastMeshMs,
      fullMeshMs: this.lastFullMeshMs,
      distanceLimited: this.budgetLimited,
    };
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.pause();
  };

  private onContextRestored = () => {
    // Geometry data was released after upload, so rebuild every mesh.
    this.clearMeshes();
    this.generation++;
    this.jobs.clear();
    this.inflight = this.inflight.map(() => 0);
    for (const c of this.chunks) c.requestedKey = null;
    this.refreshChunks();
  };

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.soonTimer);
    clearTimeout(this.distanceTimer);
    this.pause();
    this.stopWorkers();
    this.clearMeshes();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.solidMat.dispose();
    this.translucentMat.dispose();
    this.texArray.dispose();
    this.appTex.dispose();
    this.highlightTex.dispose();
    this.renderer.dispose();
  }
}
