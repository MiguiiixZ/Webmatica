# Webmatica

**Live site: https://webmatica.pages.dev**

A lightweight, in-browser 3D viewer for **Litematica** schematics (`.litematic`), made to sit in a second window
or on a second screen while you build in Minecraft. Open a schematic, step through it layer by layer, tick off
materials as you collect them, and switch back to the game with Alt+Tab. Your view, layer and progress are
exactly where you left them.

- **100% client-side.** Files are processed in your browser and never uploaded. No accounts, no backend.
- **Light on resources.** Nothing is drawn unless something changes; nothing runs while the tab is hidden.
- **Works from a link.** No install. Chrome, Edge, Firefox and Safari (recent versions).

> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**
> Webmatica is a free fan project (no ads, no accounts, no payments) and is not affiliated with Mojang Studios,
> Microsoft, or the author of Litematica.

## Features

**Viewer**
- Orbit camera and free "spectator" camera (WASD + mouse), switch with `C`.
- Hidden-face culling, greedy meshing and ambient occlusion, built in Web Workers.
- Approximate shapes for slabs, stairs (incl. corners), fences, walls, panes, doors, trapdoors, plants, torches,
  liquids, beds, chests, signs and many more. Real models when you load your own `client.jar`.
- Textured (bundled Pixel Perfection CE textures) or flat-color mode, optional ghost style (semi-transparent,
  like Litematica's overlay) and block grid lines.
- Hover a block to see its name, block state and coordinates (relative, and world coordinates once you enter the
  schematic's origin). Measure distances between two blocks.
- A small compass in the top-right corner shows which way you are facing (north is −Z, as in the game).
- Rotate and mirror the view. Multiple regions with independent visibility. Several schematics open as tabs.

**Layers** (the main feature)
- Modes: all layers, single layer, up to layer N, from layer N up, and a range. Axis Y (default), X or Z.
- `PageUp`/`PageDown` or `]`/`[` to move, a slider, and a clickable layer strip.
- Dim layers below, highlight the current layer, highlight the next layer to build.
- Progress follows the current layer: the percentage of blocks up to and including it (what is built once that
  layer is finished, so the last layer is 100%), with a layer strip. The current layer is saved locally.

**Material List**
- Grouped by item with the exact rules Litematica uses (doors/beds/tall plants counted once, double slabs ×2,
  water/lava as buckets, waterlogged blocks add a water bucket, wall torches → torch, crops → seeds, potted plants,
  cauldron contents, blocks without items ignored, …). Container contents are not counted, as in Litematica.
- Every amount split into **shulker boxes + stacks + items**, respecting real stack sizes (64, 16 or 1).
  Example: `2,820 = 1 shulker + 17 stacks + 4` (a shulker box holds 27 stacks).
- Count the whole schematic, only the visible layers, or one region.
- Inventory-style isometric icons drawn from the active textures (your `client.jar` if loaded).
- Collected checklist (saved), sort by amount/name/status, search, highlight an item's blocks in 3D.
- Export to CSV or plain text, or copy to the clipboard.

**Persistence**
- Recent schematics, view, layer, progress and checklist are stored in your browser (IndexedDB) and offered again
  when you come back.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `PageUp` / `]` | Layer up |
| `PageDown` / `[` | Layer down |
| `Home` / `End` | First / last layer |
| `L` | Cycle layer mode |
| `C` | Orbit / free camera |
| `W A S D`, `Space` / `Shift` | Move in free camera |
| `R` | Reset camera |
| `T` | Textures / flat colors |
| `G` | Ghost style |
| `M` | Measure tool |
| `Tab` | Show / hide panels |
| `Esc` | Clear highlight / measurement |
| `?` | Help |

## Supported formats

| Format | Extension | Notes |
| --- | --- | --- |
| Litematica | `.litematic` | Format versions 1–7 (5 and 6 are the common ones), multiple regions, negative region sizes. |
| Sponge | `.schem` | Versions 1, 2 and 3 (WorldEdit 7+, FAWE). |
| Structure block | `.nbt` | Vanilla structure files; the first palette is shown when there are several. |
| MCEdit / WorldEdit legacy | `.schematic` | Minecraft 1.12 and older (numeric block ids). |

Files from **Minecraft 1.12** (pre-"flattening" block names such as `wool[color=red]`) are converted to modern ids
automatically, for both `.litematic` and `.nbt`. The format is detected from the file content, not the extension.

## Textures

The default textures are from **[Pixel Perfection CE](https://github.com/Athemis/PixelPerfectionCE)** by XSSheep and
the community, licensed **CC BY-SA 4.0** (original artwork; the project tracks and removes any file found to be a
copy of Minecraft's textures). Only the block textures are used, repacked into one atlas
(`public/textures/pixel-perfection/`). Blocks newer than 1.16 that the pack does not cover are shown with flat colors.

**Original textures in one click:** the start screen (and **Settings → Texture pack**) has a **Get original textures
from Mojang** button with a version picker. It downloads the official `client.jar` (about 40 MB) straight from
Mojang's servers (`piston-meta.mojang.com` / `piston-data.mojang.com`, which allow browser downloads) into your
browser, the same file the Minecraft launcher downloads, checks its SHA-1 against Mojang's version manifest and
processes it locally. Only the extracted textures, models and names are kept in IndexedDB. Webmatica never hosts,
proxies or redistributes Minecraft files. It is meant for players who own Minecraft: Java Edition.

You can also open **Settings → Texture pack → Load client.jar or resource pack…** and choose your own
Minecraft `client.jar` (e.g. `.minecraft/versions/1.21.1/1.21.1.jar`) or any resource pack `.zip`. It is processed
entirely in your browser and stored only on your device; Webmatica never uploads or redistributes it. With a
`client.jar`, real block models and the game's English block names are used too.

Packs can be **stacked** like in the game: load your `client.jar` first (the Mojang download always goes to the
bottom of the stack), then add resource packs on top. The pack
on top wins, and anything it does not include comes from the packs below (then from the bundled textures). The start
screen explains where to find `client.jar` and loads it with one click.

Partial resource packs work too, including redstone readability packs: missing textures fall back to the bundled
ones, and models that inherit from standard templates the pack does not ship (`cube_all`, `orientable`, stairs,
slabs, trapdoors, pistons, cauldrons…) use Webmatica's own equivalents. Parts of a pack that only display a
momentary signal level (redstone dust power, target, daylight detector and sculk sensor power, sculk sensor phase)
are ignored, since they do not help with building; useful information such as repeater delay, comparator mode,
hopper/observer/piston/dispenser direction, note block instrument and pitch, or an inverted daylight detector is kept.

**No Mojang textures or other game assets are included in this repository.** Packs based on Faithful or other
derivatives of the game's textures are not bundled either; load them yourself through the settings.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. Other scripts:

```bash
npm test            # unit tests (parser, mesher, material list, models)
npm run build       # type-check and build static files into dist/
npm run preview     # serve dist/ locally
npm run make-example                                  # regenerate public/examples/example-cottage.litematic
npm run build-textures -- <PixelPerfectionCE checkout> # rebuild the texture atlas
npx tsx scripts/make-bench.ts <dir> 500 300 500 big   # generate a large procedural test schematic
```

## Deploy to Cloudflare Pages (free plan)

The site is plain static files; no functions, databases or paid services are needed.

1. Push this repository to GitHub.
2. In the Cloudflare dashboard, open **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Build settings:
   - **Framework preset:** None (or Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js version:** the repository's `.node-version` file selects Node 22 automatically
     (or set the environment variable `NODE_VERSION` = `22`).
4. Click **Save and Deploy**. Every push to the production branch redeploys automatically; other branches get
   preview URLs.

Optional: to show a **Support Webmatica** link (Ko-fi, GitHub Sponsors, Tebex…) on the start screen, add the
environment variable `VITE_SUPPORT_URL` = `https://…` in **Settings → Variables and Secrets** of the Pages project
and redeploy. Without it, no link is shown.

`public/_headers` is copied into `dist/` and tells Cloudflare to:
- send `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, which lets the mesh workers share block data
  in memory instead of copying it (the app still works without them, it just uses a bit more RAM);
- cache the hashed files in `/assets/` for a year, textures for a week and examples for a day.

The app is served from the root of the domain (`base: '/'` in `vite.config.ts`).

## Architecture

```
src/
  parser/     NBT reader/writer, decompression, .litematic/.schem/.nbt/.schematic, 1.12 conversion,
              bit unpacking (no BigInt), chunked sparse block storage
  render/     Three.js viewer, chunk mesher, shaders, built-in models, resource pack models,
              texture packs, flat colors
  materials/  block → item rules, stack sizes, breakdown, export, names, per-layer statistics
  ui/         Preact components; all text in ui/strings.ts
  workers/    parse, mesh and texture-pack workers
  storage/    IndexedDB wrapper
  app/        file loading, per-schematic project state
```

- Blocks are stored as palette indices in 16³ chunks (`Uint8Array`/`Uint16Array`); all-air chunks take no memory.
- Meshing works on 32³ units in a pool of workers. Vertices are packed into 12 bytes; one quad index buffer is
  shared by every mesh; the JavaScript copy of each mesh is freed after it is uploaded to the GPU.
- Layer clipping happens in the shader first (instant), then only the units cut by the new layer boundary are
  re-meshed so that cut faces appear. Recent results are cached.
- A GPU memory budget (256 MB, 128 MB in low-power mode) acts as an automatic render distance for huge
  schematics: the nearest units are meshed first and far ones are dropped when the budget is reached.
- Rendering only happens on changes. Low-power mode caps at 30 FPS and renders at 75% resolution; the device pixel
  ratio is capped at 1.5 by default.

## Performance

### What was measured

All numbers below were measured for real, in this project's development environment:
a cloud container with **4 vCPUs (Intel Xeon @ 2.1 GHz), no GPU**, Node.js 22 and headless Chromium.
Because there is no GPU, Chromium rendered WebGL **in software (SwiftShader)**. Load times in the browser are
therefore pessimistic (every frame is drawn by the CPU), and **frame rates could not be measured meaningfully**.

Test schematics (generated with `scripts/make-bench.ts`, not included):
- **Town 100³** – a realistic 100×100×100 build: terrain, 16 houses/towers with windows, roofs, trees (123,274 blocks).
- **Noise 100³** – worst case: 100×100×100 of random blocks from 120 states, 60% filled (593,017 blocks).
- **City 500×300×500** – 6,249,674 blocks.

CPU cost (single thread, Node.js/V8, same engine as Chrome):

| | Town 100³ | Noise 100³ | City 500×300×500 |
| --- | --- | --- | --- |
| File size | 27 KB | 514 KB | 3.0 MB |
| Parse | 59 ms | 36 ms | 1,016 ms |
| Mesh everything (1 thread) | 122 ms | 744 ms | 5,414 ms |
| Re-mesh one full layer (1 thread) | 8.8 ms | 25 ms | 162 ms |
| Block data in memory | 0.7 MB | 1.3 MB | 42 MB |
| Geometry if everything is shown | 7.6 MB | 72 MB | 419 MB (capped by the budget) |

In the browser (headless Chromium, software WebGL, 3 mesh workers):

| | Town 100³ | Noise 100³ | City 500×300×500 (low-power) |
| --- | --- | --- | --- |
| Drop file → fully meshed | **0.95–1.0 s** | 3.0–3.4 s | 19.7 s |
| Draw calls | 61 | 129 | 997 |
| Triangles | 332,528 | 3,164,642 | 4,517,110 (512 of 1,875 units shown) |
| Geometry on GPU | 8.0 MB | 74 MB | 104 MB |
| JS heap (main thread) | 16 MB | 63–76 MB | 28 MB |
| Renderer process RSS | 198 MB | 216 MB | – |
| CPU while idle (visible, nothing moving) | 0.8 ms per 10 s | 0.6 ms per 10 s | 0.6 ms per 5 s |
| 10 layer steps until fully re-meshed | 0.18–0.69 s | 0.33–0.44 s | 0.50 s |

For reference, the start screen alone uses about 100 MB of renderer RSS in the same browser, and the JavaScript
downloaded before a file is opened is about 15 KB gzipped (the 3D viewer, ~183 KB gzipped, loads only after you open a file).

When idle, Webmatica schedules no animation frames and no timers (verified by counting `requestAnimationFrame`
calls: 0 in 2 s of idling and after releasing the free-camera keys). When the tab is hidden, rendering is skipped
entirely and pending saves are flushed.

### Compared with Minecraft + Litematica

**Not measured.** This environment has no GPU and cannot run Minecraft, so no comparison numbers are given here.
To compare on your own PC:

1. Open the same schematic in Minecraft (with Litematica) and in Webmatica.
2. Windows: Task Manager → Details (add the "GPU" and "GPU dedicated memory" columns). macOS: Activity Monitor.
   Linux: `top`/`htop` and `nvidia-smi` or `radeontop`.
3. Note CPU %, RAM and GPU usage for `javaw.exe`/`java` and for the browser tab
   (Chrome: Shift+Esc opens the browser task manager with per-tab memory and CPU).
4. Measure both while idle and while rotating the camera. Webmatica's **Settings → Show performance metrics**
   overlay shows draw calls, triangles and GPU memory estimates.

## Known limitations

- Shapes without a `client.jar` are approximations; blocks drawn by the game's block-entity renderers (chests,
  beds, signs, banners, heads, shulker boxes) are always approximate boxes.
- Biome tints use fixed plains colors. Animated textures show their first frame. No lighting other than simple face
  shading and ambient occlusion.
- Waterlogged blocks are drawn without the water inside them. Fluids are not smoothed.
- Container contents (chests, shulker boxes) are not part of the Material List, matching Litematica's schematic
  material list. Litematica's "available in inventory" columns are not available because there is no game connection.
- The Material List follows the rules of the current Litematica source code (1.21.x); older Litematica releases
  may differ in details.
- Resource packs from Minecraft 1.12 or older (`textures/blocks/`) are not supported as texture sources; 1.12
  schematics display fine with the bundled textures or a newer `client.jar`.
- Huge schematics in "all layers" mode are limited by the GPU memory budget (an automatic render distance).
- World coordinates assume the schematic is placed without rotation or mirroring in the world.
- Tested in Chromium (desktop and phone emulation). Firefox and Safari were not available in the test environment;
  only standard APIs with fallbacks are used (WebGL 2, Web Workers, IndexedDB, `DecompressionStream` with a `pako`
  fallback, `OffscreenCanvas` only for importing texture packs — Safari 16.4+).

## License

Source code: **MIT** (see `LICENSE`). Bundled textures: **CC BY-SA 4.0** (Pixel Perfection CE). Third-party
licenses and attributions: see `LICENSES` (also published at `/LICENSES.txt`). The example schematic is CC0.
