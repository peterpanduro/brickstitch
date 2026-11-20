import { describe, expect, it } from 'vitest';
import { rowLength } from '../src/core/geometry';
import type { PaletteEntry, Pattern } from '../src/core';
import {
  addPaletteEntry,
  beadCount,
  colourCounts,
  createPattern,
  cropToContent,
  floodFill,
  getCell,
  paintCells,
  removePaletteEntry,
  setCell,
  updatePaletteEntry,
} from '../src/core/pattern/ops';
import { fromRhJson, fromRowsJson } from './adapters';
import liten from './fixtures/liten.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

const pal: PaletteEntry[] = [
  { id: 'R', hex: '#d7262b' },
  { id: 'B', hex: '#0035ad' },
];
const base = { beadType: 'delica11', palette: pal } as const;
const shaped = (w = 6, h = 6) => createPattern({ ...base, mode: 'shaped', width: w, height: h });

const lattice = (p: Pattern) => {
  expect(p.cells).toHaveLength(p.height);
  p.cells.forEach((row, r) => expect(row).toHaveLength(rowLength(p.width, r)));
};

describe('createPattern', () => {
  it('fills panels and leaves shaped empty', () => {
    const panel = createPattern({ ...base, mode: 'panel', width: 4, height: 3, fill: 'R' });
    lattice(panel);
    expect(beadCount(panel)).toBe(4 + 3 + 4);
    expect(beadCount(shaped())).toBe(0);
  });
  it('validates ranges and panel fill', () => {
    expect(() => shaped(1)).toThrow();
    expect(() => shaped(81)).toThrow();
    expect(() => shaped(4, 0)).toThrow();
    expect(() => shaped(4, 121)).toThrow();
    expect(() => createPattern({ ...base, mode: 'panel', width: 4, height: 3 })).toThrow();
    expect(() =>
      createPattern({ ...base, mode: 'panel', width: 4, height: 3, fill: 'X' }),
    ).toThrow();
  });
});

describe('cells', () => {
  it('get/set/paint are immutable and identity-stable', () => {
    const p = shaped();
    const q = setCell(p, { r: 1, h: 3 }, 'R');
    expect(getCell(q, { r: 1, h: 3 })).toBe('R');
    expect(getCell(p, { r: 1, h: 3 })).toBeNull();
    expect(setCell(q, { r: 1, h: 3 }, 'R')).toBe(q);
    expect(setCell(p, { r: 0, h: 99 }, 'R')).toBe(p);
    expect(getCell(p, { r: 0, h: 1 })).toBeUndefined();
    expect(q.cells[0]).toBe(p.cells[0]);
    const m = paintCells(
      p,
      [
        { r: 0, h: 0 },
        { r: 2, h: 4 },
      ],
      'B',
    );
    expect(beadCount(m)).toBe(2);
  });
});

describe('unknown colours', () => {
  it('paintCells, setCell and floodFill throw on ids not in the palette; null is allowed', () => {
    const p = shaped();
    expect(() => paintCells(p, [{ r: 0, h: 0 }], 'Z')).toThrow();
    expect(() => setCell(p, { r: 0, h: 0 }, 'Z')).toThrow();
    expect(() => floodFill(p, { r: 0, h: 0 }, 'Z')).toThrow();
    expect(setCell(setCell(p, { r: 0, h: 0 }, 'R'), { r: 0, h: 0 }, null)).toEqual(p);
  });
});

describe('floodFill', () => {
  it('fills a null region in shaped mode across rows', () => {
    let p = shaped(4, 3);
    p = setCell(p, { r: 0, h: 2 }, 'R');
    const f = floodFill(p, { r: 0, h: 0 }, 'B');
    expect(colourCounts(f).get('B')).toBe(4 + 3 + 4 - 1);
    expect(getCell(f, { r: 0, h: 2 })).toBe('R');
  });
  it('is bounded by other colours and no-ops on same colour', () => {
    const p = fromRowsJson([
      ['R', 'R', 'B'],
      ['R', 'B'],
      ['B', 'B', 'B'],
    ]);
    const k = { ...p, palette: [...p.palette, { id: 'K', hex: '#000000' }] };
    const f = floodFill(k, { r: 0, h: 0 }, 'K');
    expect(colourCounts(f).get('K')).toBe(3);
    expect(floodFill(p, { r: 0, h: 0 }, 'R')).toBe(p);
  });
  it('does not leap across a separating wall of another colour', () => {
    let p = shaped(4, 1);
    p = setCell(p, { r: 0, h: 2 }, 'R');
    const f = floodFill(p, { r: 0, h: 0 }, 'B');
    expect(beadCount(f)).toBe(2);
  });
});

describe('counts', () => {
  it('matches fixtures', () => {
    const r = ripa4 as Record<string, string>;
    const p = fromRhJson(r);
    expect(beadCount(p)).toBe(Object.keys(r).length);
    expect(Object.fromEntries(colourCounts(p))).toEqual({ W: 231, G: 19, K: 18 });
    expect(beadCount(fromRowsJson(liten))).toBe(liten.flat().length);
  });
});

/** `(r,h)→colour` keys translated so the topmost row and leftmost even `h` are 0. */
const beads = (p: Pattern): Set<string> => {
  const all = p.cells.flatMap((row, r) =>
    row.flatMap((c, i) => (c === null ? [] : [{ r, h: 2 * i + (r & 1), c }])),
  );
  const r0 = Math.min(...all.map((b) => b.r));
  const h0 = Math.min(...all.map((b) => b.h)) & ~1;
  return new Set(all.map((b) => `${b.r - r0},${b.h - h0},${b.c}`));
};

describe('cropToContent', () => {
  it('trims even rows and whole columns, keeping lattice parity', () => {
    let p = shaped(8, 9);
    p = paintCells(
      p,
      [
        { r: 4, h: 4 },
        { r: 5, h: 5 },
        { r: 5, h: 3 },
      ],
      'R',
    );
    const c = cropToContent(p);
    lattice(c);
    expect(c.height).toBe(2);
    expect(c.width).toBe(3);
    expect(beadCount(c)).toBe(3);
  });
  it('preserves content geometry', () => {
    const p = fromRhJson(ripa4 as Record<string, string>);
    const c = cropToContent(p);
    lattice(c);
    expect(beads(c)).toEqual(beads(p));
    expect(cropToContent(c)).toBe(c);
  });
  it('keeps one empty top row when the top margin is odd; trims the bottom fully', () => {
    const c = cropToContent(paintCells(shaped(4, 5), [{ r: 3, h: 3 }], 'R'));
    expect(c.height).toBe(2);
    expect(c.cells[0]!.every((x) => x === null)).toBe(true);
    expect(getCell(c, { r: 1, h: 1 })).toBe('R');
  });
  it('returns the same pattern when empty or panel, and shifts manual ladder', () => {
    const e = shaped();
    expect(cropToContent(e)).toBe(e);
    const panel = createPattern({ ...base, mode: 'panel', width: 4, height: 3, fill: 'R' });
    expect(cropToContent(panel)).toBe(panel);
    const p = paintCells(
      { ...shaped(4, 6), ladder: { kind: 'manual', row: 3 } },
      [{ r: 3, h: 3 }],
      'R',
    );
    expect(cropToContent(p).ladder).toEqual({ kind: 'manual', row: 1 });
    const q = { ...p, ladder: { kind: 'manual', row: 0 } } as Pattern;
    expect(cropToContent(q).ladder).toEqual({ kind: 'auto' });
  });
});

describe('palette ops', () => {
  const p = setCell(shaped(), { r: 0, h: 0 }, 'R');
  it('adds, rejects duplicates, updates', () => {
    const q = addPaletteEntry(p, { id: 'Y', hex: '#ffce00' });
    expect(q.palette).toHaveLength(3);
    expect(() => addPaletteEntry(q, { id: 'Y', hex: '#000000' })).toThrow();
    expect(updatePaletteEntry(q, 'Y', { name: 'Gul' }).palette[2]).toEqual({
      id: 'Y',
      hex: '#ffce00',
      name: 'Gul',
    });
    expect(() => updatePaletteEntry(q, 'Z', {})).toThrow();
  });
  it('removes unused freely, in-use only with replacement', () => {
    expect(removePaletteEntry(p, 'B').palette.map((e) => e.id)).toEqual(['R']);
    expect(() => removePaletteEntry(p, 'R')).toThrow();
    expect(() => removePaletteEntry(p, 'R', 'Z')).toThrow();
    const q = removePaletteEntry(p, 'R', 'B');
    expect(getCell(q, { r: 0, h: 0 })).toBe('B');
    expect(q.palette.map((e) => e.id)).toEqual(['B']);
  });
});
