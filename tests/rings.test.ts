import { describe, expect, it } from 'vitest';
import { BEAD_TYPES, paletteEntryFromSeed, SEED_CATALOG, type Pattern } from '../src/core';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  type AnalysisSettings,
  type AnalysisTarget,
} from '../src/core/analysis';
import { despeckle } from '../src/core/analysis/despeckle';
import { computeFit } from '../src/core/analysis/fit';
import type { LabelImage } from '../src/core/analysis/label';
import { paintRings, planRings } from '../src/core/analysis/ring-fix';
import { RING_BINS, detectRings, pairStrokes, strokeLabelAt } from '../src/core/analysis/rings';
import type { RgbaImage } from '../src/core/imaging';
import { createPattern } from '../src/core/pattern/ops';
import { ringCandidates, ringKey, scoreRing } from '../src/core/ring';
import { fromRowsJson, ringOf } from './adapters';
import { samiFlag } from './flag';
import liten from './fixtures/liten.rows.json';

/** Label image from `f(x, y)` evaluated at pixel indices; coverage 1 on labelled pixels. */
function labels(w: number, h: number, f: (x: number, y: number) => number): LabelImage {
  const out = new Int16Array(w * h);
  const cover = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      out[y * w + x] = f(x, y);
      cover[y * w + x] = out[y * w + x]! >= 0 ? 1 : 0;
    }
  return { labels: out, cover, w, h };
}

const annulus =
  (cx: number, cy: number, rIn: number, rOut: number, ax = 1) =>
  (x: number, y: number): boolean => {
    const d = Math.hypot((x - cx) / ax, y - cy);
    return d >= rIn && d <= rOut;
  };

const OPTS = { minRadiusPx: 12, maxRadiusPx: 200 };

describe('detectRings', () => {
  it('finds one ring on a filled background with its centre, radii and colour', () => {
    const inRing = annulus(60, 55, 30, 38);
    const rings = detectRings(
      labels(120, 110, (x, y) => (inRing(x, y) ? 1 : 0)),
      OPTS,
    );
    expect(rings).toHaveLength(1);
    const r = rings[0]!;
    expect(Math.abs(r.cx - 60)).toBeLessThan(1);
    expect(Math.abs(r.cy - 55)).toBeLessThan(1);
    expect(Math.abs(r.rIn - 30)).toBeLessThan(1.5);
    expect(Math.abs(r.rOut - 38)).toBeLessThan(1.5);
    expect(r.w).toBeCloseTo(r.rOut - r.rIn, 6);
    expect(r.rM).toBeCloseTo((r.rIn + r.rOut) / 2, 6);
    expect(r.coverage).toBeGreaterThanOrEqual(0.9);
    expect(r.strokeLabel).toHaveLength(RING_BINS);
    expect([...r.strokeLabel].filter((k) => k === 1).length).toBeGreaterThanOrEqual(65);
  });

  it('finds a black O on an unlabelled background', () => {
    const inRing = annulus(50, 50, 25, 33);
    const rings = detectRings(
      labels(100, 100, (x, y) => (inRing(x, y) ? 2 : -1)),
      OPTS,
    );
    expect(rings).toHaveLength(1);
    expect(strokeLabelAt(rings[0]!, 0)).toBe(2);
  });

  it('keeps the outer edge where an O touches the bounding box (not a crop border)', () => {
    const rings = detectRings(
      labels(188, 188, (x, y) => {
        const d = Math.hypot(x - 94, y - 94);
        return d < 67 ? 0 : d <= 85 ? 1 : -1;
      }),
      { minRadiusPx: 12, maxRadiusPx: 94 },
    );
    expect(rings).toHaveLength(1);
    expect(Math.abs(rings[0]!.rOut - 85)).toBeLessThan(1.5);
  });

  it('keeps both colours of a bi-coloured ring', () => {
    const inRing = annulus(60, 60, 30, 38);
    const rings = detectRings(
      labels(120, 120, (x, y) => (inRing(x, y) ? (y < 60 ? 1 : 2) : 0)),
      OPTS,
    );
    expect(rings).toHaveLength(1);
    expect(strokeLabelAt(rings[0]!, -Math.PI / 2)).toBe(1);
    expect(strokeLabelAt(rings[0]!, Math.PI / 2)).toBe(2);
  });

  it('rejects a filled disc', () => {
    expect(
      detectRings(
        labels(120, 120, (x, y) => (Math.hypot(x - 60, y - 60) <= 38 ? 1 : 0)),
        OPTS,
      ),
    ).toEqual([]);
  });

  it('rejects a half arc', () => {
    const inRing = annulus(60, 60, 30, 38);
    expect(
      detectRings(
        labels(120, 120, (x, y) => (inRing(x, y) && y < 60 ? 1 : 0)),
        OPTS,
      ),
    ).toEqual([]);
  });

  it('rejects an ellipse with axis ratio 1.3', () => {
    const inRing = annulus(70, 60, 30, 38, 1.3);
    expect(
      detectRings(
        labels(140, 120, (x, y) => (inRing(x, y) ? 1 : 0)),
        OPTS,
      ),
    ).toEqual([]);
  });

  it('finds two rings', () => {
    const a = annulus(50, 50, 25, 32);
    const b = annulus(150, 55, 28, 35);
    const rings = detectRings(
      labels(210, 110, (x, y) => (a(x, y) ? 1 : b(x, y) ? 2 : 0)),
      OPTS,
    );
    expect(rings.map((r) => Math.round(r.cx / 10)).sort()).toEqual([15, 5]);
  });

  it('rejects a ring clipped at the image edge', () => {
    const inRing = annulus(30, 60, 30, 38);
    expect(
      detectRings(
        labels(120, 120, (x, y) => (inRing(x, y) ? 1 : 0)),
        OPTS,
      ),
    ).toEqual([]);
  });

  it('ignores circles outside the radius range', () => {
    const inRing = annulus(60, 55, 30, 38);
    const img = labels(120, 110, (x, y) => (inRing(x, y) ? 1 : 0));
    expect(detectRings(img, { minRadiusPx: 12, maxRadiusPx: 25 })).toEqual([]);
  });

  it('is deterministic', () => {
    const a = annulus(50, 50, 25, 32);
    const b = annulus(150, 55, 28, 35);
    const img = labels(210, 110, (x, y) => (a(x, y) ? 1 : b(x, y) ? 2 : y < 40 ? 3 : 0));
    expect(detectRings(img, OPTS)).toEqual(detectRings(img, OPTS));
  });
});

const catalogue = SEED_CATALOG.map((e) => paletteEntryFromSeed(e, e.db));
const ID: Record<string, string> = { R: 'DB-723', G: 'DB-724', Y: 'DB-721', B: 'DB-726' };
const BLACK = { id: 'k', hex: '#000000' };
const WHITE = { id: 'w', hex: '#ffffff' };
const RED = { id: 'r', hex: '#d7262b' };

type Rgb = readonly [number, number, number];

/** Opaque image from a colour per pixel centre. */
function image(w: number, h: number, f: (x: number, y: number) => Rgb): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...f(x + 0.5, y + 0.5), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const K: Rgb = [0, 0, 0];
const Wt: Rgb = [255, 255, 255];
const on = (s: Partial<AnalysisSettings> = {}): AnalysisSettings => ({ ...DEFAULT_SETTINGS, ...s });
const off = (s: Partial<AnalysisSettings> = {}): AnalysisSettings => on({ ...s, fixRings: false });

const hOfCell = (r: number, i: number): number => 2 * i + (r & 1);
const cellAt = (p: Pattern, r: number, h: number) => p.cells[r]?.[(h - (r & 1)) / 2];

describe('analyseImage with fixRings', () => {
  const t11: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };
  const flag = () =>
    analyseImage(samiFlag(), t11, catalogue, on({ rotation: 90 }), { now: () => 0 });
  const litenRing = ringOf(fromRowsJson(liten), 3, 13);

  it('defaults to on', () => {
    expect(DEFAULT_SETTINGS.fixRings).toBe(true);
  });

  it('replaces the flag ring by the liten ring (rotation 90, panel 11x22)', () => {
    const r = flag();
    expect(r.stats.ringsFound).toBe(1);
    expect(r.stats.ringsReplaced).toBe(1);
    const ring = r.stats.rings[0]!;
    expect(ring.widthBeads).toBe(9);
    expect(ringKey(ring.cells)).toBe(ringKey(litenRing));
    expect(scoreRing(ring.cells)).toMatchObject({
      breaks: 0,
      clumps: 0,
      lrAsym: 0,
      udAsym: 0,
      beadCount: 30,
      topRun: 4,
      bottomRun: 4,
    });
    const rs = ring.cells.map((c) => c.r);
    const r0 = Math.min(...rs);
    const h0 = Math.min(...ring.cells.map((c) => c.h));
    const lp = fromRowsJson(liten);
    const lh0 = Math.min(...litenRing.map((c) => c.h));
    for (const c of ring.cells) {
      const want = cellAt(lp, c.r - r0 + 3, c.h - h0 + lh0);
      expect(cellAt(r.pattern, c.r, c.h)).toBe(ID[want!]);
    }
    const bh = BEAD_TYPES.delica11.rowPitchMm;
    const fitted = ring.centreMm.y / bh - 0.5;
    expect(Math.abs((r0 + Math.max(...rs)) / 2 - fitted)).toBeLessThanOrEqual(1);
    expect(ring.centreMm.y).toBeCloseTo((175 / 400) * 22 * bh, 0);
    expect(ring.centreMm.x).toBeCloseTo((11 * 1.6) / 2, 0);
  });

  it('keeps the flag stripes around the ring', () => {
    const p = flag().pattern;
    expect(p.cells[0]!.every((c) => c === ID.R)).toBe(true);
    expect(p.cells[21]!.every((c) => c === ID.B)).toBe(true);
  });

  it('replaces the ring on delica15 with a perfect ring between round(Dx/bw) and round(Dy/bw)', () => {
    const t: AnalysisTarget = { beadType: 'delica15', mode: 'panel', width: 13, height: 25 };
    const r = analyseImage(samiFlag(), t, catalogue, on({ rotation: 90 }));
    const dx = (2 * 99 * 13 * 1.3) / 300;
    const dy = (2 * 99 * 25 * 1.15) / 400;
    expect(r.stats.ringsReplaced).toBe(1);
    const ring = r.stats.rings[0]!;
    expect(ring.widthBeads).toBeGreaterThanOrEqual(Math.round(dx / 1.3));
    expect(ring.widthBeads).toBeLessThanOrEqual(Math.round(dy / 1.3));
    expect(scoreRing(ring.cells, 'delica15')).toMatchObject({
      breaks: 0,
      clumps: 0,
      lrAsym: 0,
      udAsym: 0,
      widthBeads: ring.widthBeads,
    });
  });

  it('closes a black O on white (shaped) and keeps its interior', () => {
    const img = image(300, 300, (x, y) =>
      Math.abs(Math.hypot(x - 150, y - 150) - 120) <= 14 ? K : Wt,
    );
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 14, height: 18 };
    const r = analyseImage(img, t, [WHITE, BLACK], on());
    expect(r.stats.ringsReplaced).toBe(1);
    const ring = r.stats.rings[0]!;
    const s = scoreRing(ring.cells);
    expect(s.breaks).toBe(0);
    expect(ring.cells.every((c) => cellAt(r.pattern, c.r, c.h) === 'k')).toBe(true);
    const set = new Set(ring.cells.map((c) => `${c.r},${c.h}`));
    for (let r0 = 0; r0 < r.pattern.height; r0++) {
      const hs = ring.cells.filter((c) => c.r === r0).map((c) => c.h);
      if (hs.length < 2) continue;
      r.pattern.cells[r0]!.forEach((c, i) => {
        const h = hOfCell(r0, i);
        if (h > Math.min(...hs) && h < Math.max(...hs) && !set.has(`${r0},${h}`))
          expect(c).toBe('w');
      });
    }
    const black = r.pattern.cells.flatMap((row, r0) =>
      row.flatMap((c, i) => (c === 'k' ? [`${r0},${hOfCell(r0, i)}`] : [])),
    );
    expect(black.every((k) => set.has(k))).toBe(true);
    expect(ring.prunedBeads).toBe(0);
  });

  const same = (img: RgbaImage, t: AnalysisTarget, pal = [WHITE, BLACK]) => {
    const a = analyseImage(img, t, pal, on());
    const b = analyseImage(img, t, pal, off());
    expect(a.stats.ringsReplaced).toBe(0);
    expect(a.pattern).toEqual(b.pattern);
    return a;
  };
  const shaped: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 14, height: 18 };

  it('leaves a filled disc unchanged', () => {
    const a = same(
      image(300, 300, (x, y) => (Math.hypot(x - 150, y - 150) <= 130 ? K : Wt)),
      shaped,
    );
    expect(a.stats.ringsFound).toBe(0);
  });

  it('leaves a half arc unchanged', () => {
    const a = same(
      image(300, 300, (x, y) =>
        y < 150 && Math.abs(Math.hypot(x - 150, y - 150) - 120) <= 14 ? K : Wt,
      ),
      shaped,
    );
    expect(a.stats.ringsFound).toBe(0);
  });

  it('replaces two rings', () => {
    const img = image(600, 300, (x, y) =>
      Math.abs(Math.hypot(x - 150, y - 150) - 110) <= 14 ||
      Math.abs(Math.hypot(x - 450, y - 150) - 110) <= 14
        ? K
        : Wt,
    );
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 26, height: 16 };
    const r = analyseImage(img, t, [WHITE, BLACK], on());
    expect(r.stats.ringsFound).toBe(2);
    expect(r.stats.ringsReplaced).toBe(2);
    for (const ring of r.stats.rings) expect(scoreRing(ring.cells).breaks).toBe(0);
  });

  it('skips a ring clipped at the edge of a full-bleed image', () => {
    const img = image(300, 400, (x, y) =>
      Math.abs(Math.hypot(x - 112, y - 200) - 104) <= 12
        ? [0xff, 0xce, 0]
        : y < 200
          ? [0xd7, 0x26, 0x2b]
          : [0, 0x35, 0xad],
    );
    expect(same(img, t11, catalogue).stats.ringsFound).toBe(1);
  });

  it('is deterministic', () => {
    expect(flag()).toEqual(flag());
  });
});

describe('planRings', () => {
  const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };
  const pattern = createPattern({ ...t, palette: [WHITE], fill: 'w' });
  const fit = computeFit(110, 220, t, 0, 'stretch');
  const ring = (cx: number, cy: number, rOut: number) => ({
    cx,
    cy,
    rIn: rOut - 6,
    rOut,
    w: 6,
    rM: rOut - 3,
    strokeLabel: new Int16Array(RING_BINS).fill(0),
    coverage: 1,
  });
  const ctx = { fit, x0: 0, y0: 0, pattern, search: ringCandidates };

  it('places a centred ring on the middle column', () => {
    const [p] = planRings([ring(54.5, 100, 45)], ctx);
    expect(p!.widthBeads).toBe(9);
    const hs = p!.cells.map((c) => c.h);
    expect((Math.min(...hs) + Math.max(...hs)) / 2).toBe(10);
  });

  it('skips a ring that is clipped even one bead narrower', () => {
    expect(planRings([ring(20, 100, 45)], ctx)).toEqual([]);
  });

  it('never lets a later ring overlap an earlier one', () => {
    const plans = planRings([ring(54.5, 100, 45), ring(54.5, 110, 45)], ctx);
    const keys = plans.flatMap((p) => p.cells.map((c) => `${c.r},${c.h}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('skips a stroke wider than 1.75 beads', () => {
    expect(planRings([{ ...ring(54.5, 100, 45), rIn: 15, w: 30, rM: 30 }], ctx)).toEqual([]);
  });

  it('skips a target under 3 beads', () => {
    expect(planRings([{ ...ring(54.5, 100, 12), rIn: 9, w: 3, rM: 10.5 }], ctx)).toEqual([]);
  });
});

describe('despeckle with locked cells', () => {
  it('keeps a locked speckle', () => {
    const cells = [
      [0, 0, 0],
      [0, 1],
      [0, 0, 0],
    ];
    const locked = cells.map((row, r) => row.map((_, i) => r === 1 && i === 1));
    expect(despeckle(cells, [false, false])[1]![1]).toBe(0);
    expect(despeckle(cells, [false, false], locked)[1]![1]).toBe(1);
  });
});

describe.skipIf(!import.meta.env['VITE_PERF'])('fixRings perf (VITE_PERF=1)', () => {
  it('analyses a 1200x900 flag into 11x22 with and without fixRings', () => {
    const img = samiFlag(1200, 900);
    for (const s of [off({ rotation: 90 }), on({ rotation: 90 })]) {
      const t0 = performance.now();
      const r = analyseImage(img, t11Perf, catalogue, s);
      const ms = performance.now() - t0;
      console.log(`PERF fixRings=${s.fixRings} ${ms.toFixed(0)}ms`, r.stats.timings);
      expect(ms).toBeLessThan(1000);
    }
  });
});

const t11Perf: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };

describe('review fixes (R37)', () => {
  const PAL = [WHITE, BLACK];
  const cRing = (gapDeg: number) =>
    image(300, 300, (x, y) =>
      Math.abs(Math.hypot(x - 150, y - 150) - 110) <= 18 &&
      !(Math.abs(Math.atan2(y - 150, x - 150)) < (gapDeg / 2) * (Math.PI / 180))
        ? K
        : Wt,
    );
  const shaped1114: AnalysisTarget = {
    beadType: 'delica11',
    mode: 'shaped',
    width: 11,
    height: 14,
  };

  it.each([20, 30])('does not close a C with a %i° gap', (g) => {
    const a = analyseImage(cRing(g), shaped1114, PAL, on());
    const b = analyseImage(cRing(g), shaped1114, PAL, off());
    expect(a.stats.ringsReplaced).toBe(0);
    expect(a.pattern).toEqual(b.pattern);
  });

  it('still replaces the closed O', () => {
    expect(analyseImage(cRing(0), shaped1114, PAL, on()).stats.ringsReplaced).toBe(1);
  });

  it('rejects a label-image C with a 20° gap in the detector', () => {
    const inRing = annulus(60, 60, 30, 38);
    const gap = (x: number, y: number) => Math.abs(Math.atan2(y - 60, x - 60)) < Math.PI / 18;
    expect(
      detectRings(
        labels(120, 120, (x, y) => (inRing(x, y) && !gap(x, y) ? 1 : 0)),
        OPTS,
      ),
    ).toEqual([]);
  });

  it('strokeLabelAt does not fill a gap wider than 2 bins', () => {
    const strokeLabel = new Int16Array(RING_BINS).fill(1);
    for (let k = 30; k < 36; k++) strokeLabel[k] = -1;
    const r = { cx: 0, cy: 0, rIn: 1, rOut: 2, w: 1, rM: 1.5, strokeLabel, coverage: 1 };
    const theta = (k: number) => ((k + 0.5) / RING_BINS) * 2 * Math.PI - Math.PI;
    expect(strokeLabelAt(r, theta(30))).toBe(1);
    expect(strokeLabelAt(r, theta(33))).toBe(-1);
  });

  it('never pairs the background gap of a double ring when a circle is missed', () => {
    const a = annulus(100, 100, 56, 68);
    const b = annulus(100, 100, 79, 91);
    const l = labels(200, 200, (x, y) => (a(x, y) || b(x, y) ? 1 : 0));
    const circle = (r: number) => ({ cx: 100, cy: 100, r });
    for (const cs of [
      [circle(68), circle(79), circle(91)],
      [circle(56), circle(68), circle(79)],
    ]) {
      const rings = pairStrokes(l, cs);
      expect(rings.every((r) => [...r.strokeLabel].every((k) => k !== 0))).toBe(true);
    }
    const all = pairStrokes(l, [circle(56), circle(68), circle(79), circle(91)]);
    expect(all.map((r) => Math.round(r.rM))).toEqual([62, 85]);
    const holed = labels(200, 200, (x, y) => {
      const d = Math.hypot(x - 100, y - 100);
      return a(x, y) || b(x, y) ? 1 : d < 91 ? 0 : -1;
    });
    const both = pairStrokes(holed, [circle(56), circle(68), circle(79), circle(91)]);
    expect(both.map((r) => Math.round(r.rM))).toEqual([62, 85]);
  });

  it('fixes both rings of a close double ring on a panel, or neither', () => {
    const img = image(400, 400, (x, y) => {
      const d = Math.hypot(x - 200, y - 200);
      return Math.abs(d - 170) <= 10 || Math.abs(d - 140) <= 10 ? [215, 38, 43] : Wt;
    });
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 20, height: 24 };
    const pal = [...PAL, RED];
    const r = analyseImage(img, t, pal, on());
    expect(r.stats.ringsFound).toBe(2);
    expect(r.stats.ringsReplaced).toBe(2);
    const keys = r.stats.rings.flatMap((g) => g.cells.map((c) => `${c.r},${c.h}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('skips the whole concentric group when the rings cannot be separated', () => {
    const d = { cx: 50, cy: 100, rIn: 39, rOut: 45, w: 6, rM: 42, coverage: 1 };
    const strokeLabel = new Int16Array(RING_BINS).fill(0);
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };
    const pattern = createPattern({ ...t, palette: [WHITE], fill: 'w' });
    const fit = computeFit(110, 220, t, 0, 'stretch');
    const fixed = ringCandidates({ targetWidthBeads: 9 }).slice(0, 1);
    const ctx = { fit, x0: 0, y0: 0, pattern, search: () => fixed };
    const inner = { ...d, strokeLabel };
    const outer = { ...d, rIn: 41, rOut: 47, rM: 44, strokeLabel };
    expect(planRings([inner, outer], ctx)).toEqual([]);
  });

  it('replaces both rings of a concentric double ring (shaped)', () => {
    const img = image(400, 400, (x, y) => {
      const d = Math.hypot(x - 200, y - 200);
      return Math.abs(d - 170) <= 12 || Math.abs(d - 125) <= 12 ? K : Wt;
    });
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 20, height: 24 };
    expect(analyseImage(img, t, PAL, on()).stats.ringsReplaced).toBe(2);
  });

  it.each([
    [3, { beadType: 'delica11', mode: 'shaped', width: 3, height: 4 }],
    [5, { beadType: 'delica11', mode: 'shaped', width: 5, height: 6 }],
  ] as const)('replaces a %i-bead ring', (w, t) => {
    const img = image(120, 120, (x, y) =>
      Math.abs(Math.hypot(x - 60, y - 60) - 50) <= 9 ? K : Wt,
    );
    const r = analyseImage(img, t, PAL, on());
    expect(r.stats.ringsReplaced).toBe(1);
    expect(r.stats.rings[0]!.widthBeads).toBe(w);
  });

  it('keeps a thick O thick', () => {
    const img = image(300, 300, (x, y) =>
      Math.abs(Math.hypot(x - 150, y - 150) - 115) <= 16 ? K : Wt,
    );
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 14, height: 18 };
    const r = analyseImage(img, t, PAL, on());
    expect(r.stats.ringsReplaced).toBe(1);
    const ring = r.stats.rings[0]!;
    const thin = ringCandidates({ beadType: 'delica11', targetWidthBeads: ring.widthBeads })[0]!;
    expect(ring.cells.length).toBeGreaterThan(thin.cells.length);
  });

  it('does not overflow a ring tangent to a stripe (stretch, panel 16x16)', () => {
    const img = image(400, 300, (x, y) =>
      Math.abs(Math.hypot(x - 200, y - 150) - 100) <= 10
        ? [0xff, 0xce, 0]
        : x < 310
          ? [0xd7, 0x26, 0x2b]
          : [0, 0x35, 0xad],
    );
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 16, height: 16 };
    const pal = [
      WHITE,
      BLACK,
      ...['#d7262b', '#0035ad', '#ffce00', '#007229'].map((hex, i) => ({ id: 'rbyg'[i]!, hex })),
    ];
    const r = analyseImage(img, t, pal, on());
    expect(r.stats.ringsReplaced).toBe(1);
    const edgeMm = 310 * ((16 * 1.6) / 400);
    for (const c of r.stats.rings[0]!.cells) expect(((c.h + 1) * 1.6) / 2).toBeLessThan(edgeMm);
  });

  it('paints and counts only cells with a stroke label', () => {
    const p = createPattern({
      beadType: 'delica11',
      mode: 'shaped',
      width: 4,
      height: 2,
      palette: [WHITE],
    });
    const cells = p.cells.map((row) => row.map(() => -1));
    const strokeLabel = new Int16Array(RING_BINS).fill(-1);
    for (let k = 0; k < RING_BINS / 2; k++) strokeLabel[k] = 1;
    const ring = { cx: 1.5, cy: 0.5, rIn: 1, rOut: 2, w: 1, rM: 1.5, strokeLabel, coverage: 1 };
    const fit = { mmPerPx: 1.6, mmPerPxY: 1.3, ox: 0, oy: 0 };
    const plan = {
      ring,
      cells: [
        { r: 0, h: 2 },
        { r: 1, h: 3 },
      ],
      widthBeads: 3,
      centreMm: { x: 0, y: 0 },
    };
    const { painted } = paintRings(cells, [plan], { fit, x0: 0, y0: 0 }, 'delica11');
    expect(painted[0]).toEqual([{ r: 0, h: 2 }]);
  });
});
