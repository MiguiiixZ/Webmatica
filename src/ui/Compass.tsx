import { useEffect, useRef } from 'preact/hooks';
import type { Viewer } from '../render/viewer';
import { S } from './strings';

const LETTERS: [string, number][] = [
  ['N', 0],
  ['E', 90],
  ['S', 180],
  ['W', 270],
];

/**
 * Small compass in the top-right corner showing which way the camera faces.
 * It is updated straight from the viewer's frame callback (no re-render) and only
 * when the heading changes, so it costs nothing while the view is still.
 */
export function Compass({ viewer }: { viewer: Viewer }) {
  const rose = useRef<SVGGElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastFacing = '';
    const apply = (h: number) => {
      const g = rose.current;
      if (!g) return;
      // Rotate the rose so "N" points to north on screen; keep the letters upright.
      g.setAttribute('transform', `rotate(${(-h).toFixed(1)} 24 24)`);
      for (const t of Array.from(g.querySelectorAll('text'))) {
        t.setAttribute('transform', `rotate(${h.toFixed(1)} ${t.getAttribute('x')} ${t.getAttribute('y')})`);
      }
      const facing = S.compassDirs[Math.round(h / 45) % 8];
      if (facing !== lastFacing && root.current) {
        lastFacing = facing;
        root.current.title = S.compassFacing(facing);
        root.current.setAttribute('aria-label', S.compassFacing(facing));
      }
    };
    viewer.onHeading = apply;
    apply(viewer.getHeading());
    return () => {
      if (viewer.onHeading === apply) viewer.onHeading = null;
    };
  }, [viewer]);

  return (
    <div class="overlay compass" ref={root} role="img">
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx="24" cy="24" r="22.5" class="compass-bg" />
        <g ref={rose}>
          <path d="M24 9 L28 24 L20 24 Z" class="compass-north" />
          <path d="M24 39 L28 24 L20 24 Z" class="compass-south" />
          {LETTERS.map(([l, a]) => {
            const r = (a * Math.PI) / 180;
            const x = (24 + Math.sin(r) * 16.5).toFixed(2);
            const y = (24 - Math.cos(r) * 16.5).toFixed(2);
            return (
              <text key={l} x={x} y={y} class={l === 'N' ? 'compass-letter n' : 'compass-letter'}>
                {l}
              </text>
            );
          })}
        </g>
        <path d="M24 1.5 L26 5 L22 5 Z" class="compass-mark" />
      </svg>
    </div>
  );
}
