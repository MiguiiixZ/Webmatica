import { useEffect, useState } from 'preact/hooks';
import type { Viewer, ViewerMetrics } from '../render/viewer';
import type { Schematic } from '../parser/types';
import { S } from './strings';

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MetricsOverlay({ viewer, schematic }: { viewer: Viewer; schematic: Schematic }) {
  const [m, setM] = useState<ViewerMetrics>(viewer.metrics());
  useEffect(() => {
    // Updated after rendered frames only (no polling loop), at most 4 times per second.
    let last = 0;
    viewer.onFrame = () => {
      const now = performance.now();
      if (now - last > 250) {
        last = now;
        setM(viewer.metrics());
      }
    };
    setM(viewer.metrics());
    return () => {
      viewer.onFrame = null;
    };
  }, [viewer]);
  const blockBytes = schematic.regions.reduce((s, r) => s + r.volume.byteSize, 0);
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return (
    <div class="overlay metrics chip mono">
      <dl class="kv">
        <dt>{S.metricsFps}</dt>
        <dd>{m.fps ? m.fps.toFixed(0) : '–'} (on demand)</dd>
        <dt>{S.metricsFrame}</dt>
        <dd>{m.frameMs.toFixed(2)} ms CPU</dd>
        <dt>{S.metricsDraws}</dt>
        <dd>{m.drawCalls}</dd>
        <dt>{S.metricsTris}</dt>
        <dd>{m.triangles.toLocaleString('en-US')}</dd>
        <dt>{S.metricsChunks}</dt>
        <dd>
          {m.chunksShown} / {m.chunksTotal}
        </dd>
        <dt>{S.metricsGeometry}</dt>
        <dd>{mb(m.geometryBytes)}</dd>
        <dt>{S.metricsTextures}</dt>
        <dd>{mb(m.textureBytes)}</dd>
        <dt>{S.metricsBlocks}</dt>
        <dd>{mb(blockBytes)}</dd>
        {heap !== undefined && (
          <>
            <dt>{S.metricsHeap}</dt>
            <dd>{mb(heap)}</dd>
          </>
        )}
        <dt>{S.metricsPending}</dt>
        <dd>
          {m.pendingJobs} · {m.lastMeshMs.toFixed(1)} ms/chunk
        </dd>
      </dl>
    </div>
  );
}
