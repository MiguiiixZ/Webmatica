import type { BlockVolume, BlockVolumeData } from './volume';

export type Vec3 = [number, number, number];

export type SchematicFormat = 'litematic' | 'sponge' | 'structure' | 'mcedit';

export interface BlockState {
  /** Namespaced id, e.g. "minecraft:oak_stairs". */
  name: string;
  /** Block state properties, e.g. { facing: "north", half: "bottom" }. */
  props: Record<string, string>;
}

export interface RegionData {
  name: string;
  /** Minimum corner of the region inside the schematic's enclosing box. */
  offset: Vec3;
  /** Size of the region (always positive). */
  size: Vec3;
  volume: BlockVolumeData;
  /** Number of non-air blocks. */
  blockCount: number;
  /** Number of tile (block) entities stored for this region. */
  tileEntityCount: number;
}

export interface Region extends Omit<RegionData, 'volume'> {
  volume: BlockVolume;
}

export interface SchematicMetadata {
  name: string;
  author: string;
  description: string;
  /** Raw format version (e.g. litematic Version 6). */
  formatVersion: number;
  /** Minecraft data version, or -1 when unknown. */
  dataVersion: number;
  timeCreated?: number;
  timeModified?: number;
  /** Total blocks as declared in the file metadata (if any). */
  declaredTotalBlocks?: number;
  declaredTotalVolume?: number;
  /** True when the file used pre-1.13 (1.12 and older) block names that were converted. */
  convertedFromLegacy: boolean;
}

/** Plain, transferable representation produced by the parse worker. */
export interface SchematicData {
  format: SchematicFormat;
  meta: SchematicMetadata;
  /** Size of the box enclosing all regions. */
  size: Vec3;
  /** Global palette. Index 0 is always air. */
  palette: BlockState[];
  regions: RegionData[];
  /** Non-air block count per palette id, over all regions. */
  totalCounts: Uint32Array;
  /** Non-fatal problems found while parsing. */
  warnings: string[];
}

export interface Schematic extends Omit<SchematicData, 'regions'> {
  regions: Region[];
}

export const AIR = 'minecraft:air';

/** Builds a stable string key for a block state. */
export function stateKey(s: BlockState): string {
  const keys = Object.keys(s.props);
  if (keys.length === 0) return s.name;
  keys.sort();
  return `${s.name}[${keys.map((k) => `${k}=${s.props[k]}`).join(',')}]`;
}

/** Parses a key produced by stateKey back into a state. */
export function parseStateKey(key: string): BlockState {
  const i = key.indexOf('[');
  if (i < 0) return { name: normalizeName(key), props: {} };
  const props: Record<string, string> = {};
  for (const part of key.slice(i + 1, -1).split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) props[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return { name: normalizeName(key.slice(0, i)), props };
}

export function normalizeName(name: string): string {
  const n = name.trim().toLowerCase();
  return n.includes(':') ? n : `minecraft:${n}`;
}

/** The id without the "minecraft:" namespace (other namespaces are kept). */
export function shortName(name: string): string {
  return name.startsWith('minecraft:') ? name.slice(10) : name;
}

const AIR_LIKE = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void']);

export function isAirName(name: string): boolean {
  return AIR_LIKE.has(name);
}

export class SchematicError extends Error {}
