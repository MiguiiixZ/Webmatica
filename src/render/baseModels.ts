/**
 * Generic parent models used when a resource pack's models inherit from
 * standard templates the pack does not ship (most packs only override a few
 * models and rely on the game's own "cube_all", "orientable", "stairs"...).
 *
 * These definitions were written for Webmatica from the block shapes; they
 * use the conventional texture variable names so that pack models resolve.
 * A pack's own model with the same name always takes precedence.
 */

type Face = { texture: string; cullface?: string; uv?: number[] };
type El = { from: number[]; to: number[]; faces: Record<string, Face> };

const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** A box whose faces use the given texture variables; boundary faces get a cullface. */
function box(from: number[], to: number[], tex: Partial<Record<(typeof DIRS)[number], string>>): El {
  const faces: Record<string, Face> = {};
  const onEdge: Record<string, boolean> = {
    down: from[1] === 0,
    up: to[1] === 16,
    north: from[2] === 0,
    south: to[2] === 16,
    west: from[0] === 0,
    east: to[0] === 16,
  };
  for (const d of DIRS) {
    const t = tex[d];
    if (!t) continue;
    faces[d] = onEdge[d] ? { texture: t, cullface: d } : { texture: t };
  }
  return { from, to, faces };
}

const all6 = (t: string) => ({ down: t, up: t, north: t, south: t, west: t, east: t });
const bts = (bottom: string, top: string, side: string) => ({ down: bottom, up: top, north: side, south: side, west: side, east: side });

const cauldron = (contentY: number | null) => {
  const t = { down: '#bottom', up: '#top', north: '#side', south: '#side', west: '#side', east: '#side' };
  const inner = { up: '#inside', north: '#inside', south: '#inside', west: '#inside', east: '#inside' };
  const els: El[] = [
    box([0, 3, 0], [2, 16, 16], t),
    box([14, 3, 0], [16, 16, 16], t),
    box([2, 3, 0], [14, 16, 2], t),
    box([2, 3, 14], [14, 16, 16], t),
    box([2, 3, 2], [14, 4, 14], { down: '#bottom', ...inner }),
    box([0, 0, 0], [4, 3, 4], { down: '#bottom', north: '#side', west: '#side', east: '#side', south: '#side' }),
    box([12, 0, 0], [16, 3, 4], { down: '#bottom', north: '#side', west: '#side', east: '#side', south: '#side' }),
    box([0, 0, 12], [4, 3, 16], { down: '#bottom', north: '#side', west: '#side', east: '#side', south: '#side' }),
    box([12, 0, 12], [16, 3, 16], { down: '#bottom', north: '#side', west: '#side', east: '#side', south: '#side' }),
  ];
  if (contentY !== null) els.push(box([2, 4, 2], [14, contentY, 14], { up: '#content' }));
  return { elements: els };
};

export const BASE_MODELS: Record<string, unknown> = {
  block: {},
  thin_block: {},
  cube: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#down', up: '#up', north: '#north', south: '#south', west: '#west', east: '#east' })] },
  cube_all: { elements: [box([0, 0, 0], [16, 16, 16], all6('#all'))] },
  cube_column: { elements: [box([0, 0, 0], [16, 16, 16], bts('#end', '#end', '#side'))] },
  cube_column_horizontal: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#side', up: '#side', north: '#end', south: '#end', west: '#side', east: '#side' })] },
  cube_bottom_top: { elements: [box([0, 0, 0], [16, 16, 16], bts('#bottom', '#top', '#side'))] },
  orientable: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#top', up: '#top', north: '#front', south: '#side', west: '#side', east: '#side' })] },
  orientable_with_bottom: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#bottom', up: '#top', north: '#front', south: '#side', west: '#side', east: '#side' })] },
  orientable_vertical: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#side', up: '#front', north: '#side', south: '#side', west: '#side', east: '#side' })] },
  slab: { elements: [box([0, 0, 0], [16, 8, 16], bts('#bottom', '#top', '#side'))] },
  slab_top: { elements: [box([0, 8, 0], [16, 16, 16], bts('#bottom', '#top', '#side'))] },
  // Stair templates face east (the high step is on the east side), like the standard blockstates expect.
  stairs: { elements: [box([0, 0, 0], [16, 8, 16], bts('#bottom', '#top', '#side')), box([8, 8, 0], [16, 16, 16], bts('#bottom', '#top', '#side'))] },
  inner_stairs: {
    elements: [
      box([0, 0, 0], [16, 8, 16], bts('#bottom', '#top', '#side')),
      box([8, 8, 0], [16, 16, 16], bts('#bottom', '#top', '#side')),
      box([0, 8, 8], [8, 16, 16], bts('#bottom', '#top', '#side')),
    ],
  },
  outer_stairs: { elements: [box([0, 0, 0], [16, 8, 16], bts('#bottom', '#top', '#side')), box([8, 8, 8], [16, 16, 16], bts('#bottom', '#top', '#side'))] },
  template_trapdoor_bottom: { elements: [box([0, 0, 0], [16, 3, 16], all6('#texture'))] },
  template_trapdoor_top: { elements: [box([0, 13, 0], [16, 16, 16], all6('#texture'))] },
  template_trapdoor_open: { elements: [box([0, 0, 13], [16, 16, 16], all6('#texture'))] },
  // Piston templates face north (the platform is the north face).
  template_piston: { elements: [box([0, 0, 0], [16, 16, 16], { down: '#side', up: '#side', north: '#platform', south: '#bottom', west: '#side', east: '#side' })] },
  piston_extended: { elements: [box([0, 0, 4], [16, 16, 16], { down: '#side', up: '#side', north: '#inside', south: '#bottom', west: '#side', east: '#side' })] },
  template_piston_head: {
    elements: [
      box([0, 0, 0], [16, 16, 4], { down: '#side', up: '#side', north: '#platform', south: '#unsticky', west: '#side', east: '#side' }),
      { from: [6, 6, 4], to: [10, 10, 20], faces: { down: { texture: '#side2' }, up: { texture: '#side2' }, west: { texture: '#side2' }, east: { texture: '#side2' } } },
    ],
  },
  template_piston_head_short: {
    elements: [
      box([0, 0, 0], [16, 16, 4], { down: '#side', up: '#side', north: '#platform', south: '#unsticky', west: '#side', east: '#side' }),
      box([6, 6, 4], [10, 10, 16], { down: '#side2', up: '#side2', west: '#side2', east: '#side2' }),
    ],
  },
  template_cauldron_full: cauldron(15),
  template_cauldron_level1: cauldron(9),
  template_cauldron_level2: cauldron(12),
  cauldron: cauldron(null),
  sculk_sensor: {
    elements: [
      box([0, 0, 0], [16, 8, 16], bts('#bottom', '#top', '#side')),
      ...[-45, 45].map((angle) => ({
        from: [1, 8, 8],
        to: [15, 16, 8],
        rotation: { origin: [8, 8, 8], axis: 'y', angle, rescale: true },
        faces: { north: { texture: '#tendrils', uv: [0, 8, 16, 16] }, south: { texture: '#tendrils', uv: [0, 8, 16, 16] } },
      })),
    ],
  },
};
