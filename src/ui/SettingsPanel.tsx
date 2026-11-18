import type { RenderSettings } from '../render/viewState';
import { S } from './strings';
import { TexturePackSection } from './TexturePackSection';

export function SettingsPanel({ settings, setSettings }: { settings: RenderSettings; setSettings: (s: RenderSettings) => void }) {
  const set = (patch: Partial<RenderSettings>) => setSettings({ ...settings, ...patch });
  const check = (key: keyof RenderSettings, label: string) => (
    <label class="check">
      <input type="checkbox" checked={settings[key] as boolean} onChange={(e) => set({ [key]: (e.target as HTMLInputElement).checked })} />
      {label}
    </label>
  );
  return (
    <>
      <div class="section">
        <h4>{S.settingsRendering}</h4>
        <div class="row">
          <span class="muted">{S.textures}</span>
          <div class="seg">
            <button class={settings.textured ? 'active' : ''} onClick={() => set({ textured: true })}>
              {S.texturesOn}
            </button>
            <button class={!settings.textured ? 'active' : ''} onClick={() => set({ textured: false })}>
              {S.texturesOff}
            </button>
          </div>
        </div>
        {check('ao', S.ambientOcclusion)}
        {check('ghost', S.ghost)}
        {settings.ghost && (
          <label class="row">
            <span class="dim">{S.ghostOpacity}</span>
            <input
              class="grow"
              type="range"
              min={0.15}
              max={0.9}
              step={0.05}
              value={settings.ghostOpacity}
              onInput={(e) => set({ ghostOpacity: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        )}
        {check('grid', S.grid)}
      </div>
      <div class="section">
        <h4>Performance</h4>
        {check('lowPower', S.lowPower)}
        <label class="row">
          <span class="dim">{S.maxDpr}</span>
          <select value={String(settings.maxDpr)} onChange={(e) => set({ maxDpr: Number((e.target as HTMLSelectElement).value) })}>
            {[0.75, 1, 1.25, 1.5, 2, 3].map((v) => (
              <option key={v} value={String(v)}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        {check('showMetrics', S.showMetrics)}
      </div>
      <TexturePackSection />
    </>
  );
}
