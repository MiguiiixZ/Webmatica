import { convertLegacyState } from './legacy';
import { AIR, isAirName, normalizeName, stateKey, type BlockState, type RegionData, type Vec3 } from './types';
import { VolumeBuilder } from './volume';

/** Collects block states into a deduplicated global palette (id 0 = air). */
export class PaletteBuilder {
  readonly states: BlockState[] = [{ name: AIR, props: {} }];
  private readonly ids = new Map<string, number>([[AIR, 0]]);

  constructor(public legacy = false) {}

  /** Adds a state (converting legacy names if needed) and returns its global id. */
  add(raw: BlockState): number {
    let s: BlockState = { name: normalizeName(raw.name), props: raw.props };
    if (this.legacy) s = convertLegacyState(s);
    if (isAirName(s.name)) return 0;
    const key = stateKey(s);
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.states.length;
      this.states.push(s);
      this.ids.set(key, id);
    }
    return id;
  }

  get bytesPerBlock(): 1 | 2 {
    return this.states.length <= 256 ? 1 : 2;
  }
}

/** Accumulates one region's blocks and counts. */
export class RegionBuilder {
  readonly volume: VolumeBuilder;
  blockCount = 0;

  constructor(
    readonly name: string,
    readonly offset: Vec3,
    readonly size: Vec3,
    bytesPerBlock: 1 | 2,
    private readonly counts: Uint32Array,
    public tileEntityCount = 0,
  ) {
    this.volume = new VolumeBuilder(size[0], size[1], size[2], bytesPerBlock);
  }

  set(x: number, y: number, z: number, id: number): void {
    if (id === 0) return;
    const prev = this.volume.get(x, y, z);
    if (prev !== 0) {
      this.counts[prev]--;
      this.blockCount--;
    }
    this.volume.set(x, y, z, id);
    this.counts[id]++;
    this.blockCount++;
  }

  /** Fast path for formats that write every position exactly once. */
  setFresh(x: number, y: number, z: number, id: number): void {
    if (id === 0) return;
    this.volume.set(x, y, z, id);
    this.counts[id]++;
    this.blockCount++;
  }

  build(): RegionData {
    return {
      name: this.name,
      offset: this.offset,
      size: this.size,
      volume: this.volume.build().toData(),
      blockCount: this.blockCount,
      tileEntityCount: this.tileEntityCount,
    };
  }
}

/** Throws if the dimensions are unreasonable (guards against corrupt files allocating gigabytes). */
export function checkSize(size: Vec3, what: string): void {
  for (const v of size) {
    if (!Number.isFinite(v) || v < 0 || v > 30000000) throw new RangeError(`Invalid ${what} size: ${size.join(' x ')}`);
  }
  const volume = size[0] * size[1] * size[2];
  if (volume > 1_000_000_000) {
    throw new RangeError(`The ${what} is too large to open (${size.join(' x ')} = ${volume.toLocaleString('en-US')} blocks).`);
  }
}
