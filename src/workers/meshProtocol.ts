import type { BlockVolumeData } from '../parser/volume';
import type { RenderTables } from '../render/blockTables';
import type { Clip } from '../render/mesher';

export type MeshRequest =
  | {
      type: 'init';
      regions: { offset: [number, number, number]; volume: BlockVolumeData }[];
      tables: RenderTables;
      ao: boolean;
    }
  | { type: 'tables'; tables: RenderTables }
  | { type: 'options'; ao: boolean }
  | {
      type: 'mesh';
      id: number;
      cx: number;
      cy: number;
      cz: number;
      visible: boolean[];
      clip: Clip | null;
    }
  | { type: 'reset' };

export type MeshResponse =
  | { type: 'meshed'; id: number; solid: Uint32Array; translucent: Uint32Array; ms: number }
  | { type: 'error'; id: number; message: string };
