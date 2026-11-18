import { describe, expect, it } from 'vitest';
import { JarModels } from '../src/render/jarModels';
import { S } from './helpers';

// Small hand-written models in the standard resource pack format (not taken from the game).
const models = {
  cube: {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture: '#down', cullface: 'down' },
          up: { texture: '#up', cullface: 'up' },
          north: { texture: '#north', cullface: 'north' },
          south: { texture: '#south', cullface: 'south' },
          west: { texture: '#west', cullface: 'west' },
          east: { texture: '#east', cullface: 'east' },
        },
      },
    ],
  },
  cube_all: { parent: 'block/cube', textures: { down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' } },
  test_block: { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/test_block' } },
  half: {
    textures: { side: 'block/half_side' },
    elements: [{ from: [0, 0, 0], to: [16, 8, 16], faces: { north: { texture: '#side', cullface: 'north' }, up: { texture: '#side' } } }],
  },
  post: { elements: [{ from: [6, 0, 6], to: [10, 16, 10], faces: { north: { texture: 'block/post' } } }] },
  arm: { elements: [{ from: [7, 12, 0], to: [9, 15, 8], faces: { north: { texture: 'block/post', cullface: 'north' } } }] },
  plant: {
    textures: { cross: 'block/plant' },
    elements: [
      {
        from: [0.8, 0, 8],
        to: [15.2, 16, 8],
        rotation: { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true },
        faces: { north: { uv: [0, 0, 16, 16], texture: '#cross' }, south: { uv: [0, 0, 16, 16], texture: '#cross' } },
      },
    ],
  },
};
const blockstates = {
  test_block: { variants: { '': { model: 'minecraft:block/test_block' } } },
  half_block: {
    variants: {
      'facing=north': { model: 'block/half' },
      'facing=east': { model: 'block/half', y: 90 },
      'facing=up': { model: 'block/half', x: 270 },
    },
  },
  fence_like: {
    multipart: [
      { apply: { model: 'block/post' } },
      { when: { north: 'true' }, apply: { model: 'block/arm' } },
      { when: { OR: [{ east: 'true' }, { west: 'true' }] }, apply: { model: 'block/arm', y: 90 } },
    ],
  },
  plant: { variants: { '': [{ model: 'block/plant' }, { model: 'block/plant', y: 90 }] } },
};

const jm = new JarModels(models, blockstates);

describe('resource pack models', () => {
  it('resolves parents and texture variables', () => {
    const g = jm.geometry(S('test_block'))!;
    expect(g.elements).toHaveLength(1);
    expect(g.elements[0].faces.up?.tex).toBe('test_block');
    expect(g.elements[0].faces.down?.cull).toBe('down');
  });

  it('applies variant rotations to geometry, faces and cull directions', () => {
    const north = jm.geometry(S('half_block', { facing: 'north' }))!.elements[0];
    expect(north.from).toEqual([0, 0, 0]);
    expect(north.faces.north?.cull).toBe('north');
    const east = jm.geometry(S('half_block', { facing: 'east' }))!.elements[0];
    // Y rotation keeps the slab at the bottom; the north face now points east.
    expect(east.from[1]).toBe(0);
    expect(east.to[1]).toBe(8);
    expect(east.faces.east?.cull).toBe('east');
    expect(east.faces.north).toBeUndefined();
    const up = jm.geometry(S('half_block', { facing: 'up' }))!.elements[0];
    // x: 270 turns the north face upwards and the slab becomes a vertical half block.
    expect(up.faces.up?.cull).toBe('up');
    expect(up.to[1] - up.from[1]).toBe(16);
  });

  it('combines multipart pieces by condition', () => {
    expect(jm.geometry(S('fence_like', { north: 'false', east: 'false', west: 'false' }))!.elements).toHaveLength(1);
    expect(jm.geometry(S('fence_like', { north: 'true', east: 'false', west: 'false' }))!.elements).toHaveLength(2);
    expect(jm.geometry(S('fence_like', { north: 'true', east: 'true', west: 'false' }))!.elements).toHaveLength(3);
  });

  it('turns rotated elements into free quads', () => {
    const g = jm.geometry(S('plant'))!;
    expect(g.elements).toHaveLength(0);
    expect(g.quads).toHaveLength(2);
    const xs = g.quads[0].pos.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(0.8, 1);
    expect(Math.max(...xs)).toBeCloseTo(15.2, 1);
  });

  it('returns null for unknown blocks so the built-in model is used', () => {
    expect(jm.geometry(S('unknown_block'))).toBeNull();
    const provider = jm.provider();
    const m = provider(S('oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight' }), 'k1');
    expect(m.elements.length).toBeGreaterThan(0);
  });
});
