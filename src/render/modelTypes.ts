export type V3 = [number, number, number];

/** Face directions, in the order used everywhere (also the normal index). */
export const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_INDEX: Record<Dir, number> = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 };
export const DIR_VEC: V3[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];
/** Normal index used for diagonal (cross) quads. */
export const NORMAL_NONE = 6;

export enum RenderLayer {
  Solid = 0,
  Translucent = 1,
}

export interface FaceDef {
  /** Texture name, or several candidates separated by "|" (first available wins). */
  tex: string;
  /** Explicit UV in pixels [u1, v1, u2, v2]; omitted = automatic (projected) UV. */
  uv?: [number, number, number, number];
  /** Rotation of the texture in degrees (0, 90, 180, 270). */
  rot?: number;
  /** The face is hidden when the neighbour in this direction is an opaque full block. */
  cull?: Dir;
}

export interface ElementDef {
  from: V3;
  to: V3;
  faces: Partial<Record<Dir, FaceDef>>;
}

/** A free-form quad (used for diagonal plant quads). Positions in pixels (0..16). */
export interface QuadDef {
  pos: [V3, V3, V3, V3];
  uv: [[number, number], [number, number], [number, number], [number, number]];
  tex: string;
}

export interface ModelDef {
  elements: ElementDef[];
  quads?: QuadDef[];
  layer: RenderLayer;
  /** Opaque full cube: hides the touching faces of its neighbours. */
  occludes: boolean;
  /** Faces between two blocks of the same cull group are hidden (glass, leaves, water). */
  cullGroup?: string;
  /** Flat color override (RRGGBB or RRGGBBAA) for faces without a usable texture. */
  color?: string;
}
