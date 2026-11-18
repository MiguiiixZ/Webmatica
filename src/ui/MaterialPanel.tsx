import type { Schematic } from '../parser/types';
import type { ProjectState } from '../app/project';
import type { CompileResult } from '../render/blockTables';

interface Props {
  schematic: Schematic;
  project: ProjectState;
  update: (patch: Partial<ProjectState> | ((p: ProjectState) => Partial<ProjectState>)) => void;
  highlight: Set<number> | null;
  setHighlight: (s: Set<number> | null) => void;
  compiled: CompileResult;
}

export function MaterialPanel(_p: Props) {
  return <div class="dim">Material list coming in milestone 4.</div>;
}
