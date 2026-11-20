import { describe, expect, it } from 'vitest';
import { BEAD_TYPES, extentMm, hOf, iOf, rowLength, type Coord } from '../src/core/geometry';
import type { Pattern } from '../src/core';
import { fromRhJson, fromRowsJson } from './adapters';
import liten from './fixtures/liten.rows.json';
import liten10 from './fixtures/liten10.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';
import red from './fixtures/red_rh.json';

function cellsOf(p: Pattern): { c: Coord; id: string }[] {
  return p.cells.flatMap((row, r) =>
    row.flatMap((id, i) => (id === null ? [] : [{ c: { r, h: hOf(r, i) }, id }])),
  );
}

function counts(p: Pattern): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { id } of cellsOf(p)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

function sizeOf(p: Pattern) {
  return extentMm(
    cellsOf(p).map((x) => x.c),
    BEAD_TYPES[p.beadType],
  );
}

function segments(p: Pattern, r: number): number {
  const hs = cellsOf(p)
    .filter((x) => x.c.r === r)
    .map((x) => x.c.h);
  return hs.filter((h, k) => k === 0 || h - (hs[k - 1] as number) > 2).length;
}

describe('fromRowsJson', () => {
  it('liten: 22 rows, 231 beads, colours, size', () => {
    const p = fromRowsJson(liten);
    expect(p.height).toBe(22);
    expect(p.width).toBe(11);
    expect(p.mode).toBe('panel');
    expect(cellsOf(p)).toHaveLength(231);
    expect(counts(p)).toEqual({ R: 69, B: 128, G: 17, Y: 17 });
    const s = sizeOf(p);
    expect(s.width).toBeCloseTo(17.6);
    expect(s.height).toBeCloseTo(28.6);
  });

  it('liten10: 190 beads, size', () => {
    const p = fromRowsJson(liten10);
    expect(cellsOf(p)).toHaveLength(190);
    expect(sizeOf(p).width).toBeCloseTo(16.0);
    expect(sizeOf(p).height).toBeCloseTo(26.0);
  });

  it('rejects rows with wrong lengths', () => {
    expect(() =>
      fromRowsJson([
        ['R', 'R'],
        ['R', 'R'],
      ]),
    ).toThrow();
  });

  it('references only palette entries', () => {
    const p = fromRowsJson(liten);
    const ids = new Set(p.palette.map((e) => e.id));
    expect(cellsOf(p).every((x) => ids.has(x.id))).toBe(true);
  });
});

describe('fromRhJson', () => {
  const p = fromRhJson(ripa4);

  it('ripa4: 268 beads, colours, size, shaped', () => {
    expect(p.mode).toBe('shaped');
    expect(cellsOf(p)).toHaveLength(268);
    expect(counts(p)).toEqual({ W: 231, G: 19, K: 18 });
    expect(p.height).toBe(27);
    const s = sizeOf(p);
    expect(s.width).toBeCloseTo(29.6);
    expect(s.height).toBeCloseTo(35.1);
  });

  it('keeps parity and lattice bounds', () => {
    for (const { c } of cellsOf(p)) {
      expect(Math.abs(c.h - c.r) % 2).toBe(0);
      const i = iOf(c.r, c.h);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(rowLength(p.width, c.r));
    }
    p.cells.forEach((row, r) => expect(row).toHaveLength(rowLength(p.width, r)));
  });

  it('rows r=23..26 (0-based) have 2,3,3,2 segments', () => {
    expect([23, 24, 25, 26].map((r) => segments(p, r))).toEqual([2, 3, 3, 2]);
  });

  it('red_rh: W227 G19 K20 R2', () => {
    const q = fromRhJson(red);
    expect(counts(q)).toEqual({ W: 227, G: 19, K: 20, R: 2 });
  });
});
