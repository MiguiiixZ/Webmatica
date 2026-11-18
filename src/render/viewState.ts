export type LayerMode = 'all' | 'single' | 'above' | 'below' | 'range';
export type Axis = 0 | 1 | 2;

export interface LayerState {
  mode: LayerMode;
  axis: Axis;
  /** Current layer index (0-based, along `axis`). */
  current: number;
  rangeMin: number;
  rangeMax: number;
  /** Darken layers below the current one. */
  dimBelow: boolean;
  /** Slightly brighten the current layer. */
  highlightCurrent: boolean;
  /** Tint the next layer to build (first unfinished layer). */
  highlightNext: boolean;
}

export const AXIS_NAMES = ['X', 'Y', 'Z'] as const;

export function defaultLayerState(): LayerState {
  return {
    mode: 'all',
    axis: 1,
    current: 0,
    rangeMin: 0,
    rangeMax: 0,
    dimBelow: true,
    highlightCurrent: true,
    highlightNext: false,
  };
}

/** Visible layer interval [min, max] (inclusive) for a layer state and axis length. */
export function visibleRange(s: LayerState, length: number): [number, number] {
  const last = Math.max(0, length - 1);
  const cur = Math.min(Math.max(0, s.current), last);
  switch (s.mode) {
    case 'single':
      return [cur, cur];
    case 'above':
      return [cur, last];
    case 'below':
      return [0, cur];
    case 'range': {
      const a = Math.min(Math.max(0, s.rangeMin), last);
      const b = Math.min(Math.max(0, s.rangeMax), last);
      return [Math.min(a, b), Math.max(a, b)];
    }
    default:
      return [0, last];
  }
}

export interface ViewTransform {
  /** Quarter turns around the vertical axis (0..3). */
  rotation: number;
  mirrorX: boolean;
  mirrorZ: boolean;
}

export interface RenderSettings {
  textured: boolean;
  ao: boolean;
  ghost: boolean;
  ghostOpacity: number;
  grid: boolean;
  lowPower: boolean;
  maxDpr: number;
  showMetrics: boolean;
}

export function defaultRenderSettings(): RenderSettings {
  return {
    textured: true,
    ao: true,
    ghost: false,
    ghostOpacity: 0.55,
    grid: false,
    lowPower: false,
    maxDpr: 1.5,
    showMetrics: false,
  };
}

export interface CameraState {
  mode: 'orbit' | 'fly';
  position: [number, number, number];
  target: [number, number, number];
}
