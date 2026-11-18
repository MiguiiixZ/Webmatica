import type { Schematic } from '../parser/types';
import { shortName } from '../parser/types';
import type { PickResult } from '../render/viewer';
import { displayName } from '../materials/names';
import { S } from './strings';

interface Props {
  hover: PickResult | null;
  schematic: Schematic;
  origin: [number, number, number] | null;
  measureOn: boolean;
  measure: [number, number, number][];
  onClearMeasure: () => void;
  cameraMode: 'orbit' | 'fly';
}

export function StatusOverlay({ hover, schematic, origin, measureOn, measure, onClearMeasure, cameraMode }: Props) {
  let hoverEl = null;
  if (hover) {
    const st = schematic.palette[hover.paletteId];
    const props = Object.entries(st.props)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const [x, y, z] = hover.pos;
    hoverEl = (
      <div class="chip hover-info">
        <div class="name">{displayName(st.name)}</div>
        <div class="props mono">{shortName(st.name)}{props ? ` [${props}]` : ''}</div>
        <div class="props mono">
          {x}, {y}, {z}
          {origin && (
            <>
              {' '}→ {origin[0] + x}, {origin[1] + y}, {origin[2] + z}
            </>
          )}
          {schematic.regions.length > 1 && hover.region >= 0 && <> · {schematic.regions[hover.region].name}</>}
        </div>
      </div>
    );
  }
  let measureEl = null;
  if (measureOn) {
    if (measure.length === 2) {
      const [a, b] = measure;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const dist = Math.hypot(dx, dy, dz).toFixed(2);
      measureEl = (
        <div class="chip row">
          <span class="mono">{S.measureResult(dx, dy, dz, dist)}</span>
          <span class="dim">
            ({Math.abs(dx) + 1} × {Math.abs(dy) + 1} × {Math.abs(dz) + 1})
          </span>
          <button class="btn small" onClick={onClearMeasure}>
            {S.measureClear}
          </button>
        </div>
      );
    } else {
      measureEl = <div class="chip dim">{S.measureHint}{measure.length === 1 ? ` (${measure[0].join(', ')})` : ''}</div>;
    }
  }
  return (
    <div class="overlay status">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {measureEl}
        {hoverEl}
      </div>
      {cameraMode === 'fly' && <div class="chip dim hide-narrow">WASD · Space/Shift · drag to look · wheel = speed</div>}
    </div>
  );
}
