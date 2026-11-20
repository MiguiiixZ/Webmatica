import type { Schematic } from '../parser/types';
import type { ProjectState } from '../app/project';
import { minecraftVersion } from '../app/loader';
import { S } from './strings';

const FORMAT_NAMES = {
  litematic: 'Litematica (.litematic)',
  sponge: 'Sponge (.schem)',
  structure: 'Structure block (.nbt)',
  mcedit: 'MCEdit / WorldEdit (.schematic)',
};

function fmtDate(t?: number): string | null {
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function InfoPanel({ schematic, project }: { schematic: Schematic; project: ProjectState }) {
  const m = schematic.meta;
  const [x, y, z] = schematic.size;
  const blocks = schematic.regions.reduce((s, r) => s + r.blockCount, 0);
  const tiles = schematic.regions.reduce((s, r) => s + r.tileEntityCount, 0);
  const mc = minecraftVersion(m.dataVersion);
  const rows: [string, string | null][] = [
    [S.infoName, m.name],
    [S.infoAuthor, m.author || null],
    [S.infoDescription, m.description || null],
    [S.infoFormat, `${FORMAT_NAMES[schematic.format]}${m.formatVersion ? ` v${m.formatVersion}` : ''}`],
    [S.infoSize, `${x} × ${y} × ${z}`],
    [S.infoVolume, (x * y * z).toLocaleString('en-US')],
    [S.infoBlocks, blocks.toLocaleString('en-US')],
    [S.infoRegions, String(schematic.regions.length)],
    [S.infoPalette, String(schematic.palette.length - 1)],
    [S.infoTileEntities, tiles ? tiles.toLocaleString('en-US') : null],
    [S.infoDataVersion, m.dataVersion >= 0 ? String(m.dataVersion) : S.unknown],
    [S.infoMcVersion, mc],
    [S.infoCreated, fmtDate(m.timeCreated)],
    [S.infoModified, fmtDate(m.timeModified)],
    [S.infoFile, `${project.fileName} · ${fmtBytes(project.fileSize)}`],
  ];
  return (
    <>
      <div class="section">
        <h4>{S.panelInfo}</h4>
        <dl class="kv">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </>
            ))}
        </dl>
        {m.convertedFromLegacy && <div class="dim">{S.infoLegacy}</div>}
      </div>
      {schematic.regions.length > 1 && (
        <div class="section">
          <h4>{S.panelRegions}</h4>
          <dl class="kv">
            {schematic.regions.map((r) => (
              <>
                <dt>{r.name}</dt>
                <dd>
                  {r.size.join(' × ')} · {S.regionBlocks(r.blockCount)}
                </dd>
              </>
            ))}
          </dl>
        </div>
      )}
      <div class="section">
        <div class="dim">{S.officialDisclaimer}</div>
        <div class="dim mono">Webmatica · {S.buildInfo(__BUILD_ID__, __BUILD_DATE__)}</div>
      </div>
      {schematic.warnings.length > 0 && (
        <div class="section">
          <h4>{S.infoWarnings}</h4>
          {schematic.warnings.map((w) => (
            <div class="dim" key={w}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
