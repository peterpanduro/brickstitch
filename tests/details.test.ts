import { describe, expect, it, vi } from 'vitest';
import { paletteEntryFromSeed, SEED_CATALOG } from '../src/core';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  createDetailsCache,
  type AnalysisSettings,
  type AnalysisTarget,
} from '../src/core/analysis';
import * as details from '../src/core/analysis/details';
import type { RgbaImage } from '../src/core/imaging';
import { samiFlag } from './flag';

vi.mock('../src/core/analysis/details', async (orig) => {
  const m = await orig<typeof import('../src/core/analysis/details')>();
  return {
    ...m,
    restoreThinStrokes: vi.fn(m.restoreThinStrokes),
    thickenDetails: vi.fn(m.thickenDetails),
  };
});

const N = 400;
/** Black circle outline (≈ 4 px) with a thin (≈ 1.5 px) black X inside, on white. */
function circleX(): RgbaImage {
  const data = new Uint8ClampedArray(N * N * 4);
  const c = N / 2;
  const R = 160;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5 - c;
      const py = y + 0.5 - c;
      const r = Math.hypot(px, py);
      const ring = Math.abs(r - R) <= 2;
      const cross = r < R && Math.min(Math.abs(px - py), Math.abs(px + py)) / Math.SQRT2 <= 0.75;
      data.set(ring || cross ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * N + x) * 4);
    }
  return { width: N, height: N, data };
}

const PAL = [
  { id: 'w', hex: '#ffffff' },
  { id: 'k', hex: '#000000' },
];
const target: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 30, height: 34 };
const run = (d: number, img = circleX()) =>
  analyseImage(img, target, PAL, { ...DEFAULT_SETTINGS, lineSensitivity: 0.6, details: d });

/** Black cells in normalised motif coordinates (0..1 over the bounding box of all beads). */
function blackCells(cells: readonly (readonly (string | null)[])[]) {
  const rows = cells.flatMap((r, y) => (r.some((c) => c !== null) ? [y] : []));
  const cols = cells.flatMap((r) => r.flatMap((c, x) => (c !== null ? [x] : [])));
  const [r0, r1] = [Math.min(...rows), Math.max(...rows)];
  const [c0, c1] = [Math.min(...cols), Math.max(...cols)];
  return cells.flatMap((r, y) =>
    r.flatMap((c, x) =>
      c === 'k'
        ? [{ x, y, u: (x - c0 + 0.5) / (c1 - c0 + 1), v: (y - r0 + 0.5) / (r1 - r0 + 1) }]
        : [],
    ),
  );
}
const inner = (p: { u: number; v: number }) => Math.hypot(p.u - 0.5, p.v - 0.5) < 0.36;
const onX = (p: { u: number; v: number }) =>
  Math.min(Math.abs(p.u - p.v), Math.abs(p.u + p.v - 1)) < 0.12;

describe('Details slider (R42)', () => {
  it('keeps a thin outline colour at the motif edge at 0 (circle around a white inside)', () => {
    for (const d of [0, 1]) {
      const black = blackCells(run(d).pattern.cells).filter((p) => !inner(p));
      const bins = new Set(
        black.map(
          (p) =>
            Math.floor(((Math.atan2(p.v - 0.5, p.u - 0.5) + Math.PI) / (2 * Math.PI)) * 24) % 24,
        ),
      );
      expect(bins.size, `details ${d}`).toBe(24);
      expect(black.length, `details ${d}`).toBeGreaterThan(60);
    }
  });

  it('drops the thin X at 0 and keeps it, continuous, at 1', () => {
    const off = blackCells(run(0).pattern.cells).filter(inner);
    expect(off.length).toBeLessThanOrEqual(2);
    const on = blackCells(run(1).pattern.cells).filter(inner);
    expect(on.length).toBeGreaterThan(20);
    for (const p of on) expect(onX(p)).toBe(true);
    const rows = new Set(on.map((p) => p.y));
    const span = on.map((p) => p.y);
    for (let y = Math.min(...span); y <= Math.max(...span); y++) expect(rows.has(y)).toBe(true);
    const arms = [
      (p: { u: number; v: number }) => p.u < 0.5 && p.v < 0.5,
      (p: { u: number; v: number }) => p.u > 0.5 && p.v < 0.5,
      (p: { u: number; v: number }) => p.u < 0.5 && p.v > 0.5,
      (p: { u: number; v: number }) => p.u > 0.5 && p.v > 0.5,
    ];
    for (const arm of arms) expect(on.filter(arm).length).toBeGreaterThan(3);
  });

  it('is monotonic: a higher value keeps (almost) every black bead a lower value kept', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map((d) => {
      const cells = run(d).pattern.cells;
      return new Set(
        cells.flatMap((r, y) => r.flatMap((c, x) => (c === 'k' ? [`${x},${y}`] : []))),
      );
    });
    for (let i = 1; i < steps.length; i++) {
      const lost = [...steps[i - 1]!].filter((k) => !steps[i]!.has(k)).length;
      expect(lost).toBeLessThanOrEqual(Math.ceil(0.03 * steps[i - 1]!.size));
      expect(steps[i]!.size).toBeGreaterThanOrEqual(steps[i - 1]!.size);
    }
  });

  it('leaves the pipeline untouched at 0 (flag at several sizes, old settings without details)', () => {
    const cat = SEED_CATALOG.map((e) => paletteEntryFromSeed(e, e.db));
    const targets: AnalysisTarget[] = [
      { beadType: 'delica11', mode: 'panel', width: 11, height: 22 },
      { beadType: 'delica15', mode: 'panel', width: 13, height: 25 },
      { beadType: 'delica11', mode: 'panel', width: 40, height: 60 },
      { beadType: 'delica11', mode: 'shaped', width: 30, height: 36 },
    ];
    vi.mocked(details.restoreThinStrokes).mockClear();
    vi.mocked(details.thickenDetails).mockClear();
    const { details: _, ...old } = DEFAULT_SETTINGS;
    for (const t of targets)
      for (const s of [0.5, 1]) {
        const img = samiFlag(400, 300, t.height > t.width);
        const at0 = analyseImage(
          img,
          t,
          cat,
          { ...DEFAULT_SETTINGS, lineSensitivity: s },
          { now: () => 0 },
        );
        const legacy = analyseImage(
          img,
          t,
          cat,
          { ...old, lineSensitivity: s } as AnalysisSettings,
          { now: () => 0 },
        );
        expect(at0).toEqual(legacy);
      }
    expect(details.restoreThinStrokes).not.toHaveBeenCalled();
    expect(details.thickenDetails).not.toHaveBeenCalled();
  });

  it('reports what it adds as the details debug layer', () => {
    const a = analyseImage(
      circleX(),
      target,
      PAL,
      { ...DEFAULT_SETTINGS, lineSensitivity: 0.6, details: 1 },
      { debug: true },
    );
    expect(a.debug!.details.data.some((v) => v === 1)).toBe(true);
    const b = analyseImage(
      circleX(),
      target,
      PAL,
      { ...DEFAULT_SETTINGS, lineSensitivity: 0.6 },
      { debug: true },
    );
    expect(b.debug!.details.data.every((v) => v === 0)).toBe(true);
  });
});

describe('detailsMinWidth', () => {
  it('is minWidth/2 at 0 and 0 at 1, clamped', () => {
    expect(details.detailsMinWidth(0, 10)).toBe(5);
    expect(details.detailsMinWidth(0.5, 10)).toBe(2.5);
    expect(details.detailsMinWidth(1, 10)).toBe(0);
    expect(details.detailsMinWidth(2, 10)).toBe(0);
  });
});

describe('details cache', () => {
  it('reuses the Details steps for equal inputs and matches uncached runs', () => {
    const cache = createDetailsCache();
    const s = { ...DEFAULT_SETTINGS, lineSensitivity: 0.6, details: 1 };
    const a = analyseImage(circleX(), target, PAL, s, { detailsCache: cache });
    expect(cache.hits).toBe(0);
    const b = analyseImage(
      circleX(),
      target,
      PAL,
      { ...s, coverage: 0.4 },
      { detailsCache: cache },
    );
    expect(cache.hits).toBe(2);
    expect(b.pattern).toEqual(
      analyseImage(circleX(), target, PAL, { ...s, coverage: 0.4 }).pattern,
    );
    const c = analyseImage(circleX(), target, PAL, { ...s, details: 0.5 }, { detailsCache: cache });
    expect(c.pattern).toEqual(analyseImage(circleX(), target, PAL, { ...s, details: 0.5 }).pattern);
    expect(a.pattern.cells).toEqual(run(1).pattern.cells);
  });
});
