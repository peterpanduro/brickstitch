import { describe, expect, it } from 'vitest';
import { analyseImage, DEFAULT_SETTINGS } from '../src/core/analysis';
import { autoDetail } from '../src/core/analysis/autodetail';
import { hexToLab } from '../src/core/palette/color';
import type { PaletteEntry } from '../src/core/palette/types';

const WHITE = { id: 'w', hex: '#ffffff' };
const BLACK = { id: 'k', hex: '#000000' };
const GREY = { id: 'g', hex: '#e0e0e0' };
const RED = { id: 'r', hex: '#d02020' };
const labs = [WHITE, BLACK, GREY, RED].map((e) => hexToLab(e.hex));
const none = [false, false, false, false];

const labelled = (counts: readonly number[]): Int16Array =>
  Int16Array.from(counts.flatMap((n, k) => Array<number>(n).fill(k)));

describe('autoDetail (SPEC §5.4, R59.4)', () => {
  it('flags a small colour far from the dominant one', () => {
    expect(autoDetail(labelled([900, 50, 0, 50]), labs, none)).toEqual([false, true, false, true]);
  });

  it('does not flag a colour close to the dominant one, or one with 15 % or more', () => {
    expect(autoDetail(labelled([800, 40, 100, 60]), labs, none)[2]).toBe(false);
    const big = autoDetail(labelled([800, 150, 0, 50]), labs, none);
    expect(big[1]).toBe(false);
    expect(big[3]).toBe(true);
  });

  it('leaves the user flags alone as soon as one colour is flagged', () => {
    const user = [false, false, false, true];
    expect(autoDetail(labelled([900, 50, 0, 50]), labs, user)).toBe(user);
  });

  it('flags nothing without labelled pixels', () => {
    expect(autoDetail(new Int16Array(4).fill(-1), labs, none)).toEqual(none);
  });
});

describe('analyseImage with auto-detail', () => {
  const dots = (palette: PaletteEntry[]): number => {
    const w = 200;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        if (x > 20 && x < 180 && y > 20 && y < 180) data.set([255, 255, 255, 255], (y * w + x) * 4);
        if ((x - 100) ** 2 + (y - 100) ** 2 <= 4 ** 2) data.set([0, 0, 0, 255], (y * w + x) * 4);
      }
    const { pattern } = analyseImage(
      { width: w, height: w, data },
      { beadType: 'delica11', mode: 'shaped', width: 20, height: 24 },
      palette,
      { ...DEFAULT_SETTINGS, lineSensitivity: 0.3 },
    );
    return pattern.cells.flat().filter((c) => c === 'k').length;
  };

  it('lets a dot that fills under half a bead win it without a detail flag', () => {
    expect(dots([WHITE, BLACK])).toBeGreaterThanOrEqual(1);
  });

  it('leaves it to the user flags once one colour is flagged', () => {
    expect(dots([WHITE, BLACK, { ...RED, detail: true }])).toBe(0);
  });
});

describe('autoDetail guards (R59.4)', () => {
  const w = 40;
  const grid = (marks: readonly (readonly [number, number, number, number])[]): Int16Array => {
    const l = new Int16Array(w * w);
    for (const [x0, y0, mw, mh] of marks)
      for (let y = y0; y < y0 + mh; y++) for (let x = x0; x < x0 + mw; x++) l[y * w + x] = 1;
    return l;
  };
  const guard = { flat: new Uint8Array(w * w).fill(1), width: w, minArea: 9, minPixels: 0 };
  const pair = [hexToLab('#ffffff'), hexToLab('#000000')];

  it('flags a compact mark and not scattered single-pixel specks', () => {
    expect(autoDetail(grid([[10, 10, 4, 4]]), pair, [false, false], guard)[1]).toBe(true);
    const specks = grid([
      [2, 2, 1, 1],
      [9, 5, 1, 1],
      [20, 30, 1, 1],
      [33, 12, 1, 1],
      [5, 25, 1, 1],
      [30, 3, 1, 1],
      [14, 18, 1, 1],
      [27, 22, 1, 1],
    ]);
    expect(autoDetail(specks, pair, [false, false])[1]).toBe(true);
    expect(autoDetail(specks, pair, [false, false], guard)[1]).toBe(false);
  });

  it('ignores a colour under 0.05 % of the pixels', () => {
    const l = new Int16Array(10000).fill(0);
    l[5] = 1;
    expect(autoDetail(l, pair, [false, false])[1]).toBe(false);
  });

  it('does not count edge blends as a mark', () => {
    const edge = { ...guard, flat: new Uint8Array(w * w) };
    expect(autoDetail(grid([[10, 10, 4, 4]]), pair, [false, false], edge)[1]).toBe(false);
  });

  it('qualifies a one-bead eye on a large pattern by its bead area, not its image share', () => {
    const big = 1200;
    const l = new Int16Array(big * big);
    for (let y = 600; y < 612; y++) for (let x = 600; x < 612; x++) l[y * big + x] = 1;
    const g = { flat: new Uint8Array(big * big).fill(1), width: big, minArea: 9, minPixels: 36 };
    expect(autoDetail(l, pair, [false, false], g)[1]).toBe(true);
    expect(autoDetail(l, pair, [false, false], { ...g, minPixels: 400 })[1]).toBe(false);
  });

  it('copes with a tiny working image: a 2 px dot counts, a 1 px dot does not', () => {
    const small = (n: number): Int16Array => {
      const l = new Int16Array(w * w);
      for (let i = 0; i < n; i++) l[20 * w + 20 + i] = 1;
      return l;
    };
    const g = { ...guard, minArea: 2, minPixels: 2 };
    expect(autoDetail(small(2), pair, [false, false], g)[1]).toBe(true);
    expect(autoDetail(small(1), pair, [false, false], g)[1]).toBe(false);
  });
});
