import { describe, expect, it } from 'vitest';
import { type Coord } from '../src/core/geometry';
import { createPattern, getCell } from '../src/core/pattern/ops';
import type { Pattern } from '../src/core';
import {
  placeRing,
  ringAnchorFromClick,
  ringCandidates,
  ringCellsAt,
  ringKey,
  scoreRing,
} from '../src/core/ring';
import { fromRowsJson, ringOf } from './adapters';
import liten from './fixtures/liten.rows.json';
import liten10 from './fixtures/liten10.rows.json';

const litenRing = ringOf(fromRowsJson(liten), 3, 13);
const liten10Ring = ringOf(fromRowsJson(liten10), 3, 11);
const onBead = [
  { onBead: true, onRow: true },
  { onBead: true, onRow: false },
];

describe('scoreRing', () => {
  it.each([
    ['liten', litenRing, 30, 9, 11, 4],
    ['liten10', liten10Ring, 24, 7, 9, 3],
  ] as const)('%s ring: no breaks/clumps, symmetric both axes', (_, cells, n, w, rows, run) => {
    const s = scoreRing(cells);
    expect(s).toMatchObject({ breaks: 0, clumps: 0, lrAsym: 0, udAsym: 0, beadCount: n });
    expect(s.widthBeads).toBe(w);
    expect(s.heightRows).toBe(rows);
    expect([s.topRun, s.bottomRun]).toEqual([run, run]);
    expect(s.contourMm).toBeGreaterThanOrEqual(0);
  });

  it('penalises a break and asymmetry', () => {
    const broken = litenRing.filter((c) => !(c.r === 3 && c.h === 7));
    const s = scoreRing(broken);
    expect(s.breaks).toBe(2);
    expect(s.lrAsym).toBeGreaterThan(0);
    expect(s.udAsym).toBeGreaterThan(0);
    expect(s.total).toBeGreaterThan(scoreRing(litenRing).total);
  });

  it('counts clumps', () => {
    expect(scoreRing([...litenRing, { r: 4, h: 8 }]).clumps).toBeGreaterThan(0);
  });

  it('matches left/right exactly (a sheared ring is asymmetric)', () => {
    const rows: Record<number, number[]> = {
      0: [0, 2],
      1: [-1, 3],
      2: [-2, 4],
      3: [-1, 5],
      4: [0, 2, 4],
    };
    const cells = Object.entries(rows).flatMap(([r, hs]) => hs.map((h) => ({ r: +r, h })));
    expect(scoreRing(cells).lrAsym).toBeGreaterThan(0);
  });

  it('matches up/down across a row boundary with one global shift', () => {
    const rowsToCells = (rows: number[][]) => rows.flatMap((hs, r) => hs.map((h) => ({ r, h })));
    expect(
      scoreRing(
        rowsToCells([
          [0, 2],
          [-1, 3],
          [0, 4],
          [1, 3],
        ]),
      ).udAsym,
    ).toBe(0);
    expect(
      scoreRing(
        rowsToCells([
          [0, 2],
          [-1, 3],
          [0, 4],
          [1, 5],
        ]),
      ).udAsym,
    ).toBeGreaterThan(0);
    expect(
      scoreRing(
        rowsToCells([
          [0, 2],
          [-1, 3],
          [-2, 2],
          [1, 3],
        ]),
      ).udAsym,
    ).toBeGreaterThan(0);
  });

  it('scores the outer contour against the extent ellipse', () => {
    const square = [0, 1, 2, 3].flatMap((r) => [
      { r, h: r & 1 ? -5 : -6 },
      { r, h: r & 1 ? 5 : 6 },
    ]);
    expect(scoreRing(square).contourMm).toBeGreaterThan(scoreRing(litenRing).contourMm);
  });
});

const rankOf = (cells: readonly Coord[], cands: { cells: readonly Coord[] }[]) =>
  cands.findIndex((c) => ringKey(c.cells) === ringKey(cells));

describe('ringCandidates', () => {
  it('ranks the liten ring first for 9 wide centred on a bead', () => {
    const cands = ringCandidates({ targetWidthBeads: 9, centres: onBead });
    expect(cands.length).toBeLessThanOrEqual(6);
    expect(rankOf(litenRing, cands)).toBe(0);
    for (const c of cands) expect(c.centre.onBead).toBe(true);
  });

  it('ranks the liten10 ring first for 7 wide centred on a bead', () => {
    expect(rankOf(liten10Ring, ringCandidates({ targetWidthBeads: 7, centres: onBead }))).toBe(0);
  });

  it.each(['delica11', 'delica15'] as const)('best ring is perfect for widths 3..20 (%s)', (bt) => {
    for (let w = 3; w <= 20; w++) {
      const s = ringCandidates({ beadType: bt, targetWidthBeads: w, maxCandidates: 1 })[0]!.score;
      expect({ w, ...s }).toMatchObject({
        w,
        breaks: 0,
        clumps: 0,
        lrAsym: 0,
        udAsym: 0,
        widthBeads: w,
      });
    }
  });

  it('sorts best first, dedupes, keeps relative cells parity-valid', () => {
    const cands = ringCandidates({ targetWidthBeads: 9, maxCandidates: 20 });
    const keys = cands.map((c) => ringKey(c.cells));
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i]!.score.total).toBeGreaterThanOrEqual(cands[i - 1]!.score.total);
    }
    for (const c of cands) {
      for (const { r, h } of c.cells) expect((((h - r) % 2) + 2) % 2).toBe(0);
      expect(c.score.beadCount).toBe(c.cells.length);
    }
  });

  it('accepts a target diameter in mm and a thickness range', () => {
    const cands = ringCandidates({ targetDiameterMm: 14.4, thicknessMm: { min: 0.7, max: 0.8 } });
    expect(cands[0]!.score.widthMm).toBeCloseTo(14.4);
    for (const c of cands) {
      expect(c.thicknessMm).toBeGreaterThanOrEqual(0.7);
      expect(c.thicknessMm).toBeLessThanOrEqual(0.8);
    }
  });

  it('validates parameters', () => {
    expect(() => ringCandidates({})).toThrow();
    expect(() => ringCandidates({ targetWidthBeads: 2 })).toThrow();
    expect(() => ringCandidates({ targetDiameterMm: 4 })).toThrow();
    expect(() => ringCandidates({ targetWidthBeads: 9, maxCandidates: 0 })).toThrow();
    expect(() =>
      ringCandidates({ targetWidthBeads: 9, thicknessMm: { min: 0.8, max: 0.6 } }),
    ).toThrow();
    expect(() => ringCandidates({ targetWidthBeads: 9, centres: [] })).toThrow();
  });

  it('is deterministic', () => {
    const p = { targetWidthBeads: 8, maxCandidates: 10 };
    expect(ringCandidates(p)).toEqual(ringCandidates(p));
  });
});

describe.skipIf(!import.meta.env['VITE_PERF'])('ring perf (VITE_PERF=1)', () => {
  it('searches widths 7..15 in under 100 ms each', () => {
    for (const beadType of ['delica11', 'delica15'] as const) {
      for (let w = 7; w <= 15; w++) {
        const t0 = performance.now();
        ringCandidates({ beadType, targetWidthBeads: w });
        const ms = performance.now() - t0;
        console.log(`PERF ring ${beadType} w${w}=${ms.toFixed(1)}ms`);
        expect(ms).toBeLessThan(100);
      }
    }
  });
});

describe('placement', () => {
  const pal = [
    { id: 'R', hex: '#d7262b' },
    { id: 'B', hex: '#0035ad' },
  ];
  const panel = createPattern({
    beadType: 'delica11',
    mode: 'panel',
    width: 11,
    height: 22,
    palette: pal,
    fill: 'R',
  });
  const best = ringCandidates({ targetWidthBeads: 9, centres: onBead })[0]!;
  const blue = (p: Pattern) => p.cells.flat().filter((c) => c === 'B').length;

  it('ringCellsAt lists in-lattice cells and the clipped count', () => {
    const inside = ringCellsAt(panel, best, { r: 8, h: 10 });
    expect(inside).toEqual({
      cells: best.cells.map((c) => ({ r: 8 + c.r, h: 10 + c.h })),
      clipped: 0,
    });
    const edge = ringCellsAt(panel, best, { r: 0, h: 0 });
    expect(edge.cells.length + edge.clipped).toBe(best.cells.length);
    expect(edge.clipped).toBeGreaterThan(0);
  });

  it('placeRing paints the ring and reports clipping', () => {
    const { pattern, clipped } = placeRing(panel, best, { r: 8, h: 10 }, 'B');
    expect(clipped).toBe(0);
    for (const c of best.cells) expect(getCell(pattern, { r: 8 + c.r, h: 10 + c.h })).toBe('B');
    expect(blue(pattern)).toBe(best.cells.length);
    const edge = placeRing(panel, best, { r: 0, h: 0 }, 'B');
    expect(blue(edge.pattern)).toBe(best.cells.length - edge.clipped);
  });

  it('throws on an anchor with invalid parity', () => {
    expect(() => placeRing(panel, best, { r: 8, h: 9 }, 'B')).toThrow(/parity/);
    expect(() => ringCellsAt(panel, best, { r: 8, h: 9 })).toThrow(/parity/);
  });

  it('ringAnchorFromClick puts the ring centre closest to the click', () => {
    const bw = 1.6;
    const bh = 1.3;
    const centreOf = (a: Coord, onB: boolean, onR: boolean) => ({
      x: ((a.h + (onB ? 0 : 1)) * bw) / 2 + bw / 2,
      y: (a.r + (onR ? 0 : 0.5)) * bh + bh / 2,
    });
    const kinds = [true, false].flatMap((b) => [true, false].map((r) => [b, r] as const));
    for (const [b, r] of kinds) {
      const cand = { ...best, centre: { onBead: b, onRow: r } };
      for (const [x, y] of [
        [8.8, 11.05],
        [8.0, 10.4],
        [3.3, 7.7],
        [9.61, 12.0],
      ] as const) {
        const a = ringAnchorFromClick(panel, x, y, cand);
        expect(Math.abs((a.h - a.r) % 2)).toBe(0);
        const d = (c: Coord) => {
          const p = centreOf(c, b, r);
          return Math.hypot(p.x - x, p.y - y);
        };
        for (let dr = -2; dr <= 2; dr++) {
          for (let dh = -4; dh <= 4; dh++) {
            if ((dh - dr) % 2 !== 0) continue;
            expect(d(a)).toBeLessThanOrEqual(d({ r: a.r + dr, h: a.h + dh }) + 1e-9);
          }
        }
      }
    }
    const a = ringAnchorFromClick(panel, 8.8, 8 * bh + bh / 2, best);
    expect(a).toEqual({ r: 8, h: 10 });
  });
});
