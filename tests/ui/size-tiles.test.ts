import { describe, expect, it } from 'vitest';
import { analyse, BEAD_TYPES, createPattern, type Pattern } from '../../src/core';
import { sizeTiles } from '../../src/ui/state/size-tiles';

const W = { id: 'w', db: 'DB-200', hex: '#F7F7F5' };

function shaped(fill: boolean): Pattern {
  const p = createPattern({
    beadType: 'delica11',
    mode: 'shaped',
    width: 6,
    height: 8,
    palette: [W],
    fill: 'w',
  });
  return { ...p, cells: p.cells.map((row, r) => row.map(() => (fill && r >= 3 ? 'w' : null))) };
}

describe('sizeTiles', () => {
  it('counts beads and non-empty rows and uses the motif size', () => {
    const p = shaped(true);
    const a = analyse(p);
    const tiles = sizeTiles(p, a);
    expect(tiles.beads).toBe(p.cells.flat().filter((c) => c !== null).length);
    expect(tiles.rows).toBe(5);
    expect(tiles.size).toEqual(a.instructions?.sizeMm);
  });

  it('uses the canvas size for an empty pattern', () => {
    const p = shaped(false);
    const t = BEAD_TYPES.delica11;
    expect(sizeTiles(p, analyse(p))).toEqual({
      beads: 0,
      rows: 0,
      size: { width: 6 * t.widthMm, height: 8 * t.rowPitchMm },
    });
  });
});
