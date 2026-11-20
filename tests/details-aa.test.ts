import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, analyseImage, type AnalysisTarget } from '../src/core/analysis';
import type { RgbaImage } from '../src/core/imaging';
import { AA_PALETTE, BLACK, RED, aaBird, aaLines, aaOcg, aaSquare2 } from './aa-images';

const SHAPED: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 30, height: 34 };
const PANEL: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 24, height: 30 };
const cells = (img: RgbaImage, details: number, t = SHAPED) =>
  analyseImage(img, t, AA_PALETTE, { ...DEFAULT_SETTINGS, details }).pattern.cells.flat();
const count = (c: readonly (string | null)[], id: string) => c.filter((x) => x === id).length;

const IMAGES: [string, () => RgbaImage][] = [
  ['bird', () => aaBird()],
  ['line drawing', aaLines],
];

describe('Details on anti-aliased images (R42)', () => {
  for (const [name, make] of IMAGES)
    for (const t of [SHAPED, PANEL])
      it(`keeps black and adds no grey from 0 to 1 (${name}, ${t.mode})`, () => {
        const img = make();
        let prev = -1;
        for (const d of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
          const c = cells(img, d, t);
          const k = count(c, 'c1');
          expect(count(c, 'c6'), `grey at ${d}`).toBe(0);
          if (prev >= 0) expect(k, `black at ${d}`).toBeGreaterThanOrEqual(Math.floor(0.97 * prev));
          prev = k;
        }
      });

  it('keeps the bird outline at 0', () => {
    expect(count(cells(aaBird(), 0), 'c1')).toBeGreaterThan(100);
  });

  it('adds no fringe colour around thick O, C, G strokes at 0 (as main)', () => {
    for (const [fg, id, fringe, main] of [
      [BLACK, 'c1', 'c6', 29],
      [RED, 'c2', 'c7', 29],
    ] as const) {
      const c = cells(aaOcg(fg), 0);
      expect(count(c, fringe)).toBe(0);
      expect(count(c, id)).toBeGreaterThanOrEqual(main);
    }
  });

  it('does not bulge one half of a red/blue square into the other at 0 (as main)', () => {
    const c = cells(aaSquare2(), 0);
    expect([count(c, 'c2'), count(c, 'c3')]).toEqual([476, 459]);
    const p = cells(aaSquare2(), 0, PANEL);
    expect([count(p, 'c2'), count(p, 'c3')]).toEqual([333, 319]);
  });
});
