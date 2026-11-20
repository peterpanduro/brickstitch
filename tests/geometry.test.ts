import { describe, expect, it } from 'vitest';
import {
  BEAD_TYPES,
  centreMm,
  extentMm,
  hOf,
  iOf,
  neighbours,
  rowLength,
} from '../src/core/geometry';

describe('geometry', () => {
  it('has bead type dimensions', () => {
    expect(BEAD_TYPES.delica11).toMatchObject({ widthMm: 1.6, rowPitchMm: 1.3 });
    expect(BEAD_TYPES.delica15).toMatchObject({ widthMm: 1.3, rowPitchMm: 1.15 });
  });

  it('alternates row lengths W, W-1', () => {
    expect([0, 1, 2, 3].map((r) => rowLength(11, r))).toEqual([11, 10, 11, 10]);
  });

  it('keeps parity: h - r is even, and h/i round-trip', () => {
    for (let r = 0; r < 6; r++) {
      for (let i = 0; i < rowLength(7, r); i++) {
        const h = hOf(r, i);
        expect(Math.abs(h - r) % 2).toBe(0);
        expect(iOf(r, h)).toBe(i);
      }
    }
    expect(hOf(0, 0)).toBe(0);
    expect(hOf(1, 0)).toBe(1);
    expect(hOf(3, 2)).toBe(5);
  });

  it('returns the six neighbours', () => {
    expect(neighbours({ r: 2, h: 4 })).toEqual([
      { r: 2, h: 2 },
      { r: 2, h: 6 },
      { r: 1, h: 3 },
      { r: 1, h: 5 },
      { r: 3, h: 3 },
      { r: 3, h: 5 },
    ]);
  });

  it('computes bead centre in mm', () => {
    const c = centreMm({ r: 1, h: 3 }, BEAD_TYPES.delica11);
    expect(c.x).toBeCloseTo(2.4);
    expect(c.y).toBeCloseTo(1.3);
  });

  it('computes pattern extent in mm', () => {
    const coords = [
      { r: 0, h: 0 },
      { r: 0, h: 20 },
      { r: 21, h: 19 },
    ];
    const s = extentMm(coords, BEAD_TYPES.delica11);
    expect(s.width).toBeCloseTo(17.6);
    expect(s.height).toBeCloseTo(28.6);
    expect(extentMm(coords, BEAD_TYPES.delica15).width).toBeCloseTo(14.3);
  });
});
