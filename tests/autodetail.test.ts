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
