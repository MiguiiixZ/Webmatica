/**
 * Chunk mesher (runs inside a Web Worker).
 *
 * For one 16^3 chunk it:
 *  1. copies the chunk plus a 1-block border from all visible regions into a
 *     padded 18^3 buffer, treating blocks outside the layer clip range as air;
 *  2. emits faces of full cubes that are not hidden by an opaque neighbour
 *     (or by a neighbour of the same cull group, e.g. glass next to glass),
 *     merging coplanar faces with identical appearance and lighting
 *     (greedy meshing);
 *  3. copies precompiled quads of non-cubic blocks, skipping culled faces.
 *
 * Vertex format: 3 x uint32 per vertex (12 bytes)
 *   w0: x | y << 10 | z << 20 | ao << 30   (positions in 1/32 block, chunk-local)
 *   w1: normal | explicitUv << 3 | rot << 4 | uv << 6 | appearance << 16
 *   w2: palette id
 * Quads use a shared index pattern (0,1,2, 0,2,3).
 */
import { BlockVolume, CHUNK, CHUNK_VOLUME } from '../parser/volume';
import { CULL_NONE, FLAG_CUBE, FLAG_EMPTY, FLAG_OCCLUDES, FLAG_TRANSLUCENT, QUAD_STRIDE, type RenderTables } from './blockTables';

export interface MeshRegion {
  offset: [number, number, number];
  volume: BlockVolume;
}

export interface Clip {
  axis: 0 | 1 | 2;
  min: number;
  max: number;
}

export interface MeshOutput {
  solid: Uint32Array;
  translucent: Uint32Array;
}

const P = CHUNK + 2; // padded size
const P2 = P * P;
/** Offsets in the padded buffer for each direction (down, up, north, south, west, east). */
const NEIGHBOR = [-P2, P2, -P, P, -1, 1];

class Buf {
  data: Uint32Array;
  length = 0;
  constructor(initial: number) {
    this.data = new Uint32Array(initial);
  }
  reserve(n: number): void {
    if (this.length + n <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  result(): Uint32Array {
    return this.data.slice(0, this.length);
  }
}

export class Mesher {
  private readonly padded = new Uint16Array(P * P * P);
  private readonly solid = new Buf(1 << 16);
  private readonly translucent = new Buf(1 << 14);
  // Greedy masks for one slice: appearance key (0 = no face) and palette id.
  private readonly maskKey = new Uint32Array(CHUNK * CHUNK);
  private readonly maskPal = new Uint16Array(CHUNK * CHUNK);
  private readonly maskTr = new Uint8Array(CHUNK * CHUNK);
  ao = true;

  constructor(
    private regions: MeshRegion[],
    private tables: RenderTables,
  ) {}

  setTables(t: RenderTables): void {
    this.tables = t;
  }

  setRegions(r: MeshRegion[]): void {
    this.regions = r;
  }

  /** Fills the padded buffer for the chunk at chunk coords (cx, cy, cz). Returns false if it is empty. */
  private fill(cx: number, cy: number, cz: number, visible: boolean[], clip: Clip | null): boolean {
    const pad = this.padded;
    pad.fill(0);
    const ox = cx * CHUNK - 1;
    const oy = cy * CHUNK - 1;
    const oz = cz * CHUNK - 1;
    let any = false;
    for (let ri = 0; ri < this.regions.length; ri++) {
      if (!visible[ri]) continue;
      const { offset, volume } = this.regions[ri];
      // Overlap of [o, o+P) with the region in schematic coordinates.
      const x0 = Math.max(ox, offset[0]);
      const y0 = Math.max(oy, offset[1]);
      const z0 = Math.max(oz, offset[2]);
      const x1 = Math.min(ox + P, offset[0] + volume.sx);
      const y1 = Math.min(oy + P, offset[1] + volume.sy);
      const z1 = Math.min(oz + P, offset[2] + volume.sz);
      if (x0 >= x1 || y0 >= y1 || z0 >= z1) continue;
      for (let y = y0; y < y1; y++) {
        if (clip && clip.axis === 1 && (y < clip.min || y > clip.max)) continue;
        const ly = y - offset[1];
        for (let z = z0; z < z1; z++) {
          if (clip && clip.axis === 2 && (z < clip.min || z > clip.max)) continue;
          const lz = z - offset[2];
          const rowBase = (y - oy) * P2 + (z - oz) * P - ox;
          for (let x = x0; x < x1; x++) {
            if (clip && clip.axis === 0 && (x < clip.min || x > clip.max)) continue;
            const id = volume.get(x - offset[0], ly, lz);
            if (id !== 0) {
              pad[rowBase + x] = id;
              any = true;
            }
          }
        }
      }
    }
    return any;
  }

  /** Meshes one chunk. `visible` lists which regions are shown. */
  mesh(cx: number, cy: number, cz: number, visible: boolean[], clip: Clip | null): MeshOutput {
    this.solid.length = 0;
    this.translucent.length = 0;
    if (this.fill(cx, cy, cz, visible, clip)) {
      this.emitQuads();
      for (let d = 0; d < 6; d++) this.greedy(d);
    }
    return { solid: this.solid.result(), translucent: this.translucent.result() };
  }

  private occludes(id: number): boolean {
    return (this.tables.flags[id] & FLAG_OCCLUDES) !== 0;
  }

  /** True if the face of block `id` towards neighbour `nb` is hidden. */
  private hidden(id: number, nb: number): boolean {
    if (nb === 0) return false;
    if (this.tables.flags[nb] & FLAG_OCCLUDES) return true;
    const g = this.tables.cullGroup[id];
    return g !== 0 && this.tables.cullGroup[nb] === g;
  }

  private emitQuads(): void {
    const { flags, quadStart, quads } = this.tables;
    const pad = this.padded;
    for (let y = 0; y < CHUNK; y++) {
      for (let z = 0; z < CHUNK; z++) {
        let pi = (y + 1) * P2 + (z + 1) * P + 1;
        for (let x = 0; x < CHUNK; x++, pi++) {
          const id = pad[pi];
          if (id === 0) continue;
          const f = flags[id];
          if (f & (FLAG_CUBE | FLAG_EMPTY)) continue;
          const q0 = quadStart[id];
          const q1 = quadStart[id + 1];
          if (q0 === q1) continue;
          const out = f & FLAG_TRANSLUCENT ? this.translucent : this.solid;
          out.reserve((q1 - q0) * 12);
          const bx = x * 32;
          const by = y * 32;
          const bz = z * 32;
          const data = out.data;
          for (let q = q0; q < q1; q++) {
            const base = q * QUAD_STRIDE;
            const meta = quads[base + 12];
            const cull = (meta >> 3) & 7;
            if (cull !== CULL_NONE && this.hidden(id, pad[pi + NEIGHBOR[cull]])) continue;
            const normal = meta & 7;
            const explicit = (meta >> 6) & 1;
            const rot = (meta >> 7) & 3;
            const app = quads[base + 13];
            let o = out.length;
            for (let v = 0; v < 4; v++) {
              const px = bx + quads[base + v * 3];
              const py = by + quads[base + v * 3 + 1];
              const pz = bz + quads[base + v * 3 + 2];
              data[o++] = (px | (py << 10) | (pz << 20) | (3 << 30)) >>> 0;
              data[o++] = (normal | (explicit << 3) | (rot << 4) | (quads[base + 14 + v] << 6) | (app << 16)) >>> 0;
              data[o++] = id;
            }
            out.length = o;
          }
        }
      }
    }
  }

  /**
   * Greedy meshing of full-cube faces for direction d.
   * Axes: `n` = normal axis, `u`/`v` = in-plane axes.
   */
  private greedy(d: number): void {
    const { flags, cubeFaces } = this.tables;
    const pad = this.padded;
    const nAxis = d < 2 ? 1 : d < 4 ? 2 : 0;
    const uAxis = nAxis === 0 ? 2 : 0;
    const vAxis = nAxis === 1 ? 2 : 1;
    const stride = [1, P2, P]; // padded strides for x, y, z
    const sn = stride[nAxis];
    const su = stride[uAxis];
    const sv = stride[vAxis];
    const nb = NEIGHBOR[d];
    const positive = d % 2 === 1;
    const mk = this.maskKey;
    const mp = this.maskPal;
    const mt = this.maskTr;
    const useAo = this.ao;

    for (let s = 0; s < CHUNK; s++) {
      let anyFace = false;
      for (let v = 0; v < CHUNK; v++) {
        for (let u = 0; u < CHUNK; u++) {
          const pi = (s + 1) * sn + (u + 1) * su + (v + 1) * sv;
          const id = pad[pi];
          const mi = v * CHUNK + u;
          mk[mi] = 0;
          if (id === 0 || !(flags[id] & FLAG_CUBE)) continue;
          if (this.hidden(id, pad[pi + nb])) continue;
          let ao = 0xff; // 4 x 2 bits, all fully lit
          if (useAo) ao = this.faceAo(pi + nb, su, sv);
          // key: face (appearance | rot << 12) + 1, ao in high byte.
          mk[mi] = ((cubeFaces[id * 6 + d] + 1) | (ao << 16)) >>> 0;
          mp[mi] = id;
          mt[mi] = flags[id] & FLAG_TRANSLUCENT ? 1 : 0;
          anyFace = true;
        }
      }
      if (!anyFace) continue;
      // Merge rectangles.
      for (let v = 0; v < CHUNK; v++) {
        for (let u = 0; u < CHUNK; ) {
          const mi = v * CHUNK + u;
          const key = mk[mi];
          if (key === 0) {
            u++;
            continue;
          }
          const pal = mp[mi];
          const ao = key >>> 16;
          const uniformAo = ao === 0xff || ao === 0 || ao === 0x55 || ao === 0xaa;
          let w = 1;
          let h = 1;
          if (uniformAo) {
            while (u + w < CHUNK && mk[mi + w] === key && mp[mi + w] === pal) w++;
            outer: while (v + h < CHUNK) {
              const row = (v + h) * CHUNK + u;
              for (let k = 0; k < w; k++) if (mk[row + k] !== key || mp[row + k] !== pal) break outer;
              h++;
            }
          }
          for (let dv = 0; dv < h; dv++) mk.fill(0, (v + dv) * CHUNK + u, (v + dv) * CHUNK + u + w);
          this.emitRect(d, nAxis, uAxis, vAxis, positive ? s + 1 : s, u, v, w, h, (key & 0xffff) - 1, ao, pal, mt[mi] === 1);
          u += w;
        }
      }
    }
  }

  /**
   * Ambient occlusion for the 4 corners of a face. `pa` is the padded index of
   * the air block in front of the face; corners are ordered (u0,v0), (u1,v0),
   * (u1,v1), (u0,v1). Returns 4 x 2-bit values (3 = fully lit).
   */
  private faceAo(pa: number, su: number, sv: number): number {
    const pad = this.padded;
    const o = (i: number) => (this.occludes(pad[i]) ? 1 : 0);
    const um = o(pa - su);
    const up = o(pa + su);
    const vm = o(pa - sv);
    const vp = o(pa + sv);
    const c = (s1: number, s2: number, corner: number) => (s1 && s2 ? 0 : 3 - (s1 + s2 + corner));
    const a0 = c(um, vm, o(pa - su - sv));
    const a1 = c(up, vm, o(pa + su - sv));
    const a2 = c(up, vp, o(pa + su + sv));
    const a3 = c(um, vp, o(pa - su + sv));
    return a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
  }

  private emitRect(
    d: number,
    nAxis: number,
    uAxis: number,
    vAxis: number,
    layer: number,
    u: number,
    v: number,
    w: number,
    h: number,
    face: number,
    ao: number,
    pal: number,
    translucent: boolean,
  ): void {
    const out = translucent ? this.translucent : this.solid;
    out.reserve(12);
    const app = face & 0xfff;
    const rot = (face >> 12) & 3;
    // Corners in (u, v) order: (u0,v0), (u1,v0), (u1,v1), (u0,v1)
    const cu = [u, u + w, u + w, u];
    const cv = [v, v, v + h, v + h];
    const aos = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
    // Choose winding so the quad faces outward: with axes (u, v, n) right-handed
    // the order above is counter-clockwise for the positive direction.
    const rightHanded = (uAxis + 1) % 3 === vAxis;
    let order = positiveOrder(d % 2 === 1, rightHanded);
    // Flip the triangulation diagonal for smoother AO.
    if (aos[order[0]] + aos[order[2]] < aos[order[1]] + aos[order[3]]) order = [order[1], order[2], order[3], order[0]];
    const data = out.data;
    let o = out.length;
    const w1base = (d | (rot << 4) | (app << 16)) >>> 0;
    for (const k of order) {
      const p = [0, 0, 0];
      p[nAxis] = layer * 32;
      p[uAxis] = cu[k] * 32;
      p[vAxis] = cv[k] * 32;
      data[o++] = (p[0] | (p[1] << 10) | (p[2] << 20) | (aos[k] << 30)) >>> 0;
      data[o++] = w1base;
      data[o++] = pal;
    }
    out.length = o;
  }
}

function positiveOrder(positive: boolean, rightHanded: boolean): number[] {
  return positive === rightHanded ? [0, 1, 2, 3] : [0, 3, 2, 1];
}

/** Lists the chunks (in chunk coordinates of the schematic) that contain any block of the given regions. */
export function nonEmptyChunks(regions: MeshRegion[], size: [number, number, number]): Uint8Array {
  const cx = Math.ceil(size[0] / CHUNK);
  const cy = Math.ceil(size[1] / CHUNK);
  const cz = Math.ceil(size[2] / CHUNK);
  const out = new Uint8Array(cx * cy * cz);
  for (const { offset, volume } of regions) {
    for (let y = 0; y < volume.cy; y++) {
      for (let z = 0; z < volume.cz; z++) {
        for (let x = 0; x < volume.cx; x++) {
          if (volume.slots[volume.chunkIndex(x, y, z)] < 0) continue;
          // A region chunk can straddle up to 8 schematic chunks.
          const x0 = Math.floor((offset[0] + x * CHUNK) / CHUNK);
          const y0 = Math.floor((offset[1] + y * CHUNK) / CHUNK);
          const z0 = Math.floor((offset[2] + z * CHUNK) / CHUNK);
          const x1 = Math.floor((offset[0] + Math.min(volume.sx, (x + 1) * CHUNK) - 1) / CHUNK);
          const y1 = Math.floor((offset[1] + Math.min(volume.sy, (y + 1) * CHUNK) - 1) / CHUNK);
          const z1 = Math.floor((offset[2] + Math.min(volume.sz, (z + 1) * CHUNK) - 1) / CHUNK);
          for (let yy = y0; yy <= y1; yy++)
            for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) out[(yy * cz + zz) * cx + xx] = 1;
        }
      }
    }
  }
  return out;
}

export { CHUNK_VOLUME };
