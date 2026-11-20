import { describe, expect, it, vi } from 'vitest';
import type { PaletteEntry } from '../src/core';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  type AnalysisDebug,
  type AnalysisSettings,
  type AnalysisTarget,
  type DebugLayer,
  type LabelLayer,
} from '../src/core/analysis';
import * as debugModule from '../src/core/analysis/debug';
import { createThinCache, type ThinCache } from '../src/core/analysis/debug';
import type { RgbaImage } from '../src/core/imaging';
import type { LabelImage } from '../src/core/analysis/label';
import { samiFlag } from './flag';

vi.mock('../src/core/analysis/debug', async (orig) => {
  const m = await orig<typeof import('../src/core/analysis/debug')>();
  return {
    ...m,
    backgroundLayer: vi.fn(m.backgroundLayer),
    lineLayers: vi.fn(m.lineLayers),
    labelLayer: vi.fn(m.labelLayer),
  };
});

type Rgb = readonly [number, number, number];
const K: Rgb = [0, 0, 0];
const Wt: Rgb = [255, 255, 255];
const BLACK = { id: 'k', hex: '#000000' };
const WHITE = { id: 'w', hex: '#ffffff' };

function image(w: number, h: number, f: (x: number, y: number) => Rgb): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...f(x + 0.5, y + 0.5), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const set = (s: Partial<AnalysisSettings> = {}): AnalysisSettings => ({
  ...DEFAULT_SETTINGS,
  ...s,
});
const shaped: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 20, height: 20 };
const run = (
  img: RgbaImage,
  s: Partial<AnalysisSettings> = {},
  t = shaped,
  pal: readonly PaletteEntry[] = [WHITE, BLACK],
) => analyseImage(img, t, pal, set(s), { now: () => 0, debug: true });
const dbg = (a: { debug?: AnalysisDebug }): AnalysisDebug => {
  expect(a.debug).toBeDefined();
  return a.debug!;
};
const count = (l: DebugLayer): number => l.data.reduce((n, v) => n + (v ? 1 : 0), 0);

/** Layer pixel centres (in crop-image px) that are set. */
const points = (l: DebugLayer): { x: number; y: number }[] => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++)
      if (l.data[y * l.w + x])
        out.push({
          x: l.transform.x0 + (x + 0.5) * l.transform.sx,
          y: l.transform.y0 + (y + 0.5) * l.transform.sy,
        });
  return out;
};

/** Layer pixel centres whose label is `k`. */
const labelPoints = (l: LabelLayer, k: number) =>
  points({ ...l, data: Uint8Array.from(l.data, (v) => (v === k ? 1 : 0)) });

/** White disc with a black outline on white ("white bird on white"). */
const outlinedDisc = () =>
  image(200, 160, (x, y) => (Math.abs(Math.hypot(x - 100, y - 80) - 50) <= 3 ? K : Wt));

/** Thin (≈ 1.5 px) black diagonal on white. */
const diagonal = () =>
  image(400, 400, (x, y) => (x > 40 && x < 360 && Math.abs(x - y) / Math.SQRT2 <= 0.75 ? K : Wt));

describe('analyseImage debug layers', () => {
  it('returns no debug without the flag and identical output with it', () => {
    const img = outlinedDisc();
    const plain = analyseImage(img, shaped, [WHITE, BLACK], DEFAULT_SETTINGS, { now: () => 0 });
    const withDebug = run(img);
    expect('debug' in plain).toBe(false);
    const { debug: _, ...rest } = withDebug;
    expect(rest).toEqual(plain);
  });

  it('builds no debug layers without the flag', () => {
    const spies = [
      vi.mocked(debugModule.backgroundLayer),
      vi.mocked(debugModule.lineLayers),
      vi.mocked(debugModule.labelLayer),
    ];
    for (const s of spies) s.mockClear();
    analyseImage(samiFlag(), shaped, [WHITE, BLACK], DEFAULT_SETTINGS);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    analyseImage(samiFlag(), shaped, [WHITE, BLACK], DEFAULT_SETTINGS, { debug: true });
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });

  it('is deterministic', () => {
    expect(run(diagonal(), { lineSensitivity: 0.6 })).toEqual(
      run(diagonal(), { lineSensitivity: 0.6 }),
    );
  });

  it('marks the outside of an outlined white disc as background and keeps its inside', () => {
    const d = dbg(run(outlinedDisc()));
    expect(d.background).toBe('borderKey');
    const m = d.backgroundMask;
    const at = (x: number, y: number) =>
      m.data[
        Math.floor((y - m.transform.y0) / m.transform.sy) * m.w +
          Math.floor((x - m.transform.x0) / m.transform.sx)
      ];
    expect(at(5, 5)).toBe(1);
    expect(at(195, 155)).toBe(1);
    expect(at(100, 80)).toBe(0);
    expect(at(150, 80)).toBe(0);
    expect(m.w * m.transform.sx).toBeCloseTo(200, 6);
    expect(m.h * m.transform.sy).toBeCloseTo(160, 6);
  });

  it('marks nothing as background in mode none', () => {
    const d = dbg(run(outlinedDisc(), { background: 'none' }));
    expect(d.background).toBe('none');
    expect(count(d.backgroundMask)).toBe(0);
  });

  it('keeps the background layer within 1024 px on the long side', () => {
    const d = dbg(run(image(1600, 400, (x) => (x > 700 && x < 900 ? K : Wt))));
    expect(Math.max(d.backgroundMask.w, d.backgroundMask.h)).toBeLessThanOrEqual(1024);
    expect(d.backgroundMask.w * d.backgroundMask.transform.sx).toBeGreaterThanOrEqual(1600);
  });

  it('marks thickened and thin-stroke pixels along a thin diagonal', () => {
    const d = dbg(run(diagonal(), { lineSensitivity: 0.8 }));
    expect(d.minLineWidthPx).toBeGreaterThan(1);
    expect(count(d.added)).toBeGreaterThan(50);
    expect(count(d.thin)).toBeGreaterThan(100);
    expect(d.added.w).toBe(d.thin.w);
    const reach = d.minLineWidthPx * d.added.transform.sx;
    for (const p of [...points(d.added), ...points(d.thin)]) {
      expect(Math.abs(p.x - p.y) / Math.SQRT2).toBeLessThanOrEqual(reach);
      expect(p.x).toBeGreaterThan(40 - reach);
      expect(p.x).toBeLessThan(360 + reach);
    }
    for (const l of [d.added, d.thin]) {
      const xs = points(l).map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThan(40 + 0.1 * 320);
      expect(Math.max(...xs)).toBeGreaterThan(360 - 0.1 * 320);
    }
  });

  it('marks the skeleton of a thin horizontal stroke along its length', () => {
    const img = image(400, 200, (x, y) => (x > 40 && x < 360 && Math.abs(y - 100) <= 1 ? K : Wt));
    const d = dbg(run(img, { lineSensitivity: 0.8 }));
    const xs = points(d.thin).map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(80);
    expect(Math.max(...xs)).toBeGreaterThan(320);
    for (const p of points(d.thin)) expect(Math.abs(p.y - 100)).toBeLessThan(3);
  });

  it('marks nothing at line sensitivity 0', () => {
    const d = dbg(run(diagonal(), { lineSensitivity: 0 }));
    expect(count(d.added)).toBe(0);
    expect(count(d.thin)).toBe(0);
  });

  it('marks thin coloured lines in a full-bleed panel (no background)', () => {
    const img = image(300, 200, (x, y) =>
      x > 30 && x < 270 && Math.abs(y - 100) <= 1 ? [0xd0, 0x20, 0x20] : [0x20, 0x40, 0xd0],
    );
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 24, height: 20 };
    const pal = [
      { id: 'b', hex: '#2040d0' },
      { id: 'r', hex: '#d02020', detail: true },
    ];
    const d = dbg(run(img, { background: 'none', lineSensitivity: 0.8 }, t, pal));
    const xs = points(d.thin).map((p) => p.x);
    expect(xs.length).toBeGreaterThan(50);
    expect(Math.min(...xs)).toBeLessThan(60);
    expect(Math.max(...xs)).toBeGreaterThan(240);
    for (const p of points(d.thin)) expect(Math.abs(p.y - 100)).toBeLessThan(4);
  });

  it('keeps the line layers within 1024 px and keeps thin lines when downsampling', () => {
    const img = image(1200, 1800, (x, y) =>
      Math.abs(x - 600) <= 1 && y > 100 && y < 1700
        ? K
        : x > 100 && x < 1100 && y > 100 && y < 1700
          ? [200, 200, 200]
          : Wt,
    );
    const t: AnalysisTarget = { beadType: 'delica15', mode: 'shaped', width: 80, height: 120 };
    const d = dbg(
      run(img, { lineSensitivity: 0.8 }, t, [
        WHITE,
        { id: 'g', hex: '#c8c8c8' },
        { ...BLACK, detail: true },
      ]),
    );
    for (const l of [d.added, d.thin]) {
      expect(Math.max(l.w, l.h)).toBeLessThanOrEqual(1024);
      expect(count(l)).toBeGreaterThan(0);
    }
    const ys = points(d.added).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1400);
    expect(Math.max(d.labels.w, d.labels.h)).toBeLessThanOrEqual(1024);
    expect(d.labels.transform).toEqual(d.added.transform);
    const black = labelPoints(d.labels, 2).map((p) => p.y);
    expect(Math.max(...black) - Math.min(...black)).toBeGreaterThan(1400);
  });

  it('has empty layers for an empty image', () => {
    const d = dbg(
      run(
        image(50, 50, () => Wt),
        { background: 'borderKey' },
      ),
    );
    expect(d.added.w * d.added.h).toBe(0);
    expect(d.labels.w * d.labels.h).toBe(0);
  });

  it('paints every foreground pixel in its palette index, after thickening', () => {
    const d = dbg(run(diagonal(), { lineSensitivity: 0.8 }));
    expect(d.palette).toEqual(['#ffffff', '#000000']);
    expect(d.labels.w).toBe(d.added.w);
    expect(d.labels.h).toBe(d.added.h);
    expect(d.labels.transform).toEqual(d.added.transform);
    expect(new Set(d.labels.data)).toEqual(new Set([-1, 1]));
    for (let p = 0; p < d.added.data.length; p++)
      if (d.added.data[p]) expect(d.labels.data[p]).toBe(1);
    const reach = d.minLineWidthPx * d.labels.transform.sx;
    for (const p of labelPoints(d.labels, 1))
      expect(Math.abs(p.x - p.y) / Math.SQRT2).toBeLessThanOrEqual(reach);
  });

  it('labels the outline of a white disc and leaves the removed outside at -1', () => {
    const d = dbg(run(outlinedDisc()));
    const pts = labelPoints(d.labels, 1);
    expect(pts.length).toBeGreaterThan(100);
    const inward = d.minLineWidthPx * d.labels.transform.sx;
    for (const p of pts) {
      const r = Math.hypot(p.x - 100, p.y - 80);
      expect(r).toBeLessThan(56);
      expect(r).toBeGreaterThan(44 - inward);
    }
    const l = d.labels;
    expect(l.data[0]).toBe(-1);
    expect(labelPoints(l, 0).length).toBeGreaterThan(pts.length);
  });
});

describe('thin layer cache', () => {
  const thinRun = (sens: number, thinCache?: ThinCache) =>
    analyseImage(diagonal(), shaped, [WHITE, BLACK], set({ lineSensitivity: sens }), {
      now: () => 0,
      debug: true,
      ...(thinCache ? { thinCache } : {}),
    });

  it('computes skeletons only when the thin layer is read', () => {
    const cache = createThinCache();
    const d = dbg(thinRun(0.8, cache));
    expect(cache.misses).toBe(0);
    expect(count(d.thin)).toBeGreaterThan(100);
    expect(cache.misses).toBeGreaterThan(0);
  });

  it('reuses skeletons when only line sensitivity changes, with equal layers', () => {
    const cache = createThinCache();
    void dbg(thinRun(0.6, cache)).thin;
    const m = cache.misses;
    const d = dbg(thinRun(0.9, cache));
    expect(d.thin).toEqual(dbg(thinRun(0.9)).thin);
    expect(cache.misses).toBe(m);
    void dbg(thinRun(0.9, cache)).thin;
    expect(cache.misses).toBe(m);
  });
});

describe('labelLayer', () => {
  const t = { x0: 1, y0: 2, sx: 3, sy: 4 };
  const li = (w: number, h: number, f: (x: number, y: number) => number): LabelImage => {
    const labels = new Int16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = f(x, y);
    return { labels, cover: new Float32Array(w * h).fill(1), w, h };
  };

  it('copies small images unchanged', () => {
    const l = li(3, 2, (x) => x - 1);
    const out = debugModule.labelLayer(l, t);
    expect([...out.data]).toEqual([-1, 0, 1, -1, 0, 1]);
    expect(out).toMatchObject({ w: 3, h: 2, transform: t });
  });

  it('downsamples to ≤ 1024 px keeping a 1 px line of a rare colour and foreground over background', () => {
    const l = li(2050, 10, (x, y) => (y === 5 ? 2 : x === 1001 ? 1 : x < 1000 ? 0 : -1));
    const out = debugModule.labelLayer(l, t);
    expect(out.w).toBe(684);
    expect(out.h).toBe(4);
    expect(out.transform).toEqual({ x0: 1, y0: 2, sx: 9, sy: 12 });
    for (let x = 0; x < out.w; x++) expect(out.data[out.w + x]).toBe(2);
    expect(out.data[0]).toBe(0);
    expect(out.data[333]).toBe(1);
    expect(out.data[500]).toBe(-1);
  });

  it('takes the most common colour of a block unless a 1 px line crosses it', () => {
    const fringe = li(2050, 4, (x, y) => (x === 0 && y === 0 ? 1 : x === 3 && y < 3 ? 2 : 0));
    const out = debugModule.labelLayer(fringe, t);
    expect(out.data[0]).toBe(0);
    expect(out.data[1]).toBe(2);
    const edge = li(2050, 4, (x) => (x < 4 ? 0 : x === 4 ? 3 : 1));
    expect(debugModule.labelLayer(edge, t).data[1]).toBe(0);
  });
});
