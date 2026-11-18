/**
 * Packs the block textures of the Pixel Perfection CE resource pack
 * (CC BY-SA 4.0, https://github.com/Athemis/PixelPerfectionCE) into a single
 * atlas used as the app's default texture set, and computes the average color
 * of every texture for the flat-color mode.
 *
 * Only textures/block/*.png are used. The pack's models and blockstates are
 * NOT used. Changes made to the original files (required notice under
 * CC BY-SA 4.0): animated textures are reduced to their first frame, random
 * variants (e.g. oak_leaves1.png) and OptiFine emissive overlays (*_e.png)
 * are skipped, and the remaining tiles are repacked into one PNG atlas.
 *
 * Usage: npm run build-textures -- <path to PixelPerfectionCE checkout>
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { TINTS, tintFor } from '../src/render/tints';

const src = process.argv[2];
if (!src) {
  console.error('Usage: npm run build-textures -- <path to PixelPerfectionCE checkout>');
  process.exit(1);
}
const dir = join(src, 'assets/minecraft/textures/block');
const TILE = 16;

const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
const names = new Set(files.map((f) => f.slice(0, -4)));
const keep = [...names]
  .filter((n) => {
    if (n.endsWith('_e')) return false;
    const m = /^(.*?)(\d+)$/.exec(n);
    // Random/CTM variants: "oak_leaves1" when "oak_leaves" exists.
    if (m && names.has(m[1])) return false;
    return true;
  })
  .sort();

const COLS = 32;
const rows = Math.ceil(keep.length / COLS);
const atlas = new PNG({ width: COLS * TILE, height: rows * TILE });
const colors: Record<string, string> = {};
const skipped: string[] = [];

keep.forEach((name, i) => {
  const png = PNG.sync.read(readFileSync(join(dir, `${name}.png`)));
  const w = png.width;
  if (w % TILE !== 0 || png.height < w) {
    skipped.push(name);
    return;
  }
  // Downscale (nearest) to 16x16 if needed, first frame only.
  const scale = w / TILE;
  const tint = tintFor(name);
  let r = 0, g = 0, b = 0, a = 0, covered = 0;
  const ox = (i % COLS) * TILE;
  const oy = Math.floor(i / COLS) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const si = ((y * scale) * w + x * scale) * 4;
      const di = ((oy + y) * atlas.width + ox + x) * 4;
      for (let c = 0; c < 4; c++) atlas.data[di + c] = png.data[si + c];
      const alpha = png.data[si + 3] / 255;
      if (alpha > 0) {
        let pr = png.data[si], pg = png.data[si + 1], pb = png.data[si + 2];
        if (tint) {
          pr = (pr * ((tint >> 16) & 255)) / 255;
          pg = (pg * ((tint >> 8) & 255)) / 255;
          pb = (pb * (tint & 255)) / 255;
        }
        r += pr * alpha;
        g += pg * alpha;
        b += pb * alpha;
        a += alpha;
        covered++;
      }
    }
  }
  if (a > 0) {
    const hex = (v: number) => Math.round(v / a).toString(16).padStart(2, '0');
    // Encode coverage (share of non-transparent pixels) and mean alpha in the 4th byte.
    const opacity = Math.round((a / (TILE * TILE)) * 255).toString(16).padStart(2, '0');
    colors[name] = `${hex(r)}${hex(g)}${hex(b)}${opacity}`;
  }
  void covered;
});

const outDir = 'public/textures/pixel-perfection';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'atlas.png'), PNG.sync.write(atlas, { colorType: 6 }));
writeFileSync(join(outDir, 'atlas.json'), JSON.stringify({ tile: TILE, cols: COLS, names: keep }));
writeFileSync('src/render/data/pp-colors.json', JSON.stringify(colors));
console.log(`Packed ${keep.length} textures (${skipped.length} skipped: ${skipped.join(', ')}). Tints: ${Object.keys(TINTS).length}.`);
