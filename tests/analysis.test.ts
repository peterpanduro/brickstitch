import { describe, expect, it } from 'vitest';
import { analyse, colourCounts, hexToLab, type PaletteEntry, type Pattern } from '../src/core';
import { hexToRgb } from '../src/core/palette/color';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  lineParams,
  type AnalysisSettings,
  type AnalysisTarget,
} from '../src/core/analysis';
import { despeckle } from '../src/core/analysis/despeckle';
import { computeFit } from '../src/core/analysis/fit';
import { resolveFit, resolveMargin } from '../src/core/analysis/settings';
import { foregroundMask, makeNearest } from '../src/core/analysis/prepare';
import { rasterise } from '../src/core/analysis/rasterise';
import { reduceColours } from '../src/core/analysis/reduce';
import { makeUnmix } from '../src/core/analysis/unmix';
import type { RgbaImage } from '../src/core/imaging';

const W: PaletteEntry = { id: 'w', hex: '#ffffff' };
const G: PaletteEntry = { id: 'g', hex: '#808080' };
const K: PaletteEntry = { id: 'k', hex: '#000000' };
const KD: PaletteEntry = { ...K, detail: true };
const R: PaletteEntry = { id: 'r', hex: '#d02020' };
const B: PaletteEntry = { id: 'b', hex: '#2040d0' };

type Rgba = readonly [number, number, number, number];

/** Renders `cover(x, y)` in [0,1] as a blend of `fg` over `bg`, 4x4 supersampled per pixel. */
function render(
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  fg: Rgba = [0, 0, 0, 255],
  bg: Rgba = [255, 255, 255, 255],
  aa = 1,
): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let j = 0; j < aa; j++)
        for (let i = 0; i < aa; i++) if (inside(x + (i + 0.5) / aa, y + (j + 0.5) / aa)) n++;
      const t = n / (aa * aa);
      for (let c = 0; c < 4; c++)
        data[(y * w + x) * 4 + c] = Math.round(fg[c]! * t + bg[c]! * (1 - t));
    }
  return { width: w, height: h, data };
}

function paint(img: RgbaImage, inside: (x: number, y: number) => boolean, col: Rgba): void {
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (inside(x + 0.5, y + 0.5))
        for (let c = 0; c < 4; c++) img.data[(y * img.width + x) * 4 + c] = col[c]!;
}

const shapedTarget = (width: number, height: number): AnalysisTarget => ({
  beadType: 'delica11',
  mode: 'shaped',
  width,
  height,
});

const settings = (s: Partial<AnalysisSettings> = {}): AnalysisSettings => ({
  ...DEFAULT_SETTINGS,
  ...s,
});

const ids = (p: Pattern): Set<string> => new Set(colourCounts(p).keys());

describe('lineParams', () => {
  it('maps sensitivity 0..1 linearly and clamps', () => {
    expect(lineParams(0)).toEqual({ minLineWidthBeads: 0, detailThreshold: 0.5 });
    expect(lineParams(1)).toEqual({ minLineWidthBeads: 2.5, detailThreshold: 0.15 });
    expect(lineParams(0.5).minLineWidthBeads).toBeCloseTo(1.25);
    expect(lineParams(0.5).detailThreshold).toBeCloseTo(0.325);
    expect(lineParams(2)).toEqual(lineParams(1));
    expect(lineParams(-1)).toEqual(lineParams(0));
  });
});

describe('reduceColours', () => {
  const pal = [W, G, K, R, B];
  const labs = pal.map((e) => hexToLab(e.hex));
  const nearest = makeNearest(labs);

  function run(
    specs: readonly (readonly [string, number])[],
    o: { maxColors: number; pinned?: number; palette?: PaletteEntry[] },
  ): ReturnType<typeof reduceColours> {
    const palette = o.palette ?? pal;
    const n = specs.reduce((a, [, c]) => a + c, 0);
    const data = new Uint8ClampedArray(n * 4);
    const labels = new Int16Array(n);
    let p = 0;
    for (const [hex, c] of specs)
      for (let i = 0; i < c; i++, p++) {
        const [r, g, b] = hexToRgb(hex);
        data.set([r, g, b, 255], p * 4);
        labels[p] = nearest(r, g, b);
      }
    return reduceColours({
      data,
      labels,
      width: n,
      blend: new Uint8Array(n),
      detail: palette.map((e) => !!e.detail),
      labs: palette.map((e) => hexToLab(e.hex)),
      nearest,
      ...o,
    });
  }

  it('keeps a distinct colour under 0.5 % that the old drop rule lost', () => {
    const r = run(
      [
        ['#ffffff', 1000],
        ['#000000', 500],
        ['#d02020', 4],
      ],
      { maxColors: 3 },
    );
    expect(r.at(0xd0, 0x20, 0x20)).toBe(3);
    expect(r.matches.map((m) => m.index).sort()).toEqual([0, 2, 3]);
  });

  it('merges clusters of one colour before losing a different one', () => {
    const r = run(
      [
        ['#ffffff', 400],
        ['#e8e8e8', 400],
        ['#d02020', 20],
        ['#000000', 300],
      ],
      { maxColors: 3 },
    );
    expect(r.at(0xe8, 0xe8, 0xe8)).toBe(r.at(255, 255, 255));
    expect(r.at(0xd0, 0x20, 0x20)).toBe(3);
    expect(r.at(0, 0, 0)).toBe(2);
  });

  it('lets an anti-aliased blend join its neighbours instead of taking a colour slot', () => {
    const r = run(
      [
        ['#ffffff', 50],
        ['#808080', 1],
        ['#000000', 50],
      ],
      { maxColors: 3 },
    );
    expect(r.matches.map((m) => m.index).sort()).toEqual([0, 2]);
  });

  it('keeps a thin line of a third colour between two others', () => {
    const r = run(
      [
        ['#ffffff', 50],
        ['#d02020', 1],
        ['#000000', 50],
      ],
      { maxColors: 3 },
    );
    expect(r.matches.map((m) => m.index).sort()).toEqual([0, 2, 3]);
  });

  it('maps a cluster to the nearest entry and reports the distance', () => {
    const r = run(
      [
        ['#ffffff', 100],
        ['#c82828', 50],
      ],
      { maxColors: 2 },
    );
    const red = r.matches.find((m) => m.index === 3)!;
    expect(red.deltaE).toBeGreaterThan(0);
    expect(red.deltaE).toBeLessThan(10);
    expect(red.share).toBeCloseTo(1 / 3);
  });

  it('keeps a detail colour at >= 0.1 % and lets a rarer one join the nearest cluster', () => {
    const p = [W, G, KD, R, B];
    const kept = run(
      [
        ['#ffffff', 1000],
        ['#000000', 2],
      ],
      { maxColors: 2, palette: p },
    );
    expect(kept.at(0, 0, 0)).toBe(2);
    const joined = run(
      [
        ['#ffffff', 5000],
        ['#d02020', 2000],
        ['#000000', 2],
      ],
      { maxColors: 2, palette: p },
    );
    expect(joined.at(0, 0, 0)).not.toBe(2);
  });

  it('pins an entry: it is kept and counts towards maxColors', () => {
    const r = run(
      [
        ['#808080', 300],
        ['#000000', 200],
        ['#d02020', 150],
        ['#2040d0', 100],
      ],
      { maxColors: 2, pinned: 1 },
    );
    expect(r.matches.map((m) => m.index)).toContain(1);
    expect(new Set(r.matches.map((m) => m.index)).size).toBeLessThanOrEqual(2);
    const spare = run(
      [
        ['#000000', 200],
        ['#d02020', 150],
        ['#2040d0', 100],
      ],
      { maxColors: 2, pinned: 0 },
    );
    expect(new Set(spare.matches.map((m) => m.index)).size).toBe(1);
  });

  it('is deterministic', () => {
    const specs = [
      ['#ffffff', 400],
      ['#808080', 300],
      ['#000000', 200],
      ['#d02020', 150],
    ] as const;
    const a = run(specs, { maxColors: 2 });
    const b = run(specs, { maxColors: 2 });
    expect(a.matches).toEqual(b.matches);
  });
});

describe('computeFit', () => {
  it('contains and centres the image within the margin box', () => {
    const f = computeFit(100, 50, { beadType: 'delica11', width: 12, height: 20 }, 1, 'contain');
    expect(f.mmPerPx).toBeCloseTo((10 * 1.6) / 100);
    expect(f.ox).toBeCloseTo(1.6);
    expect(f.oy).toBeCloseTo((20 * 1.3 - 50 * f.mmPerPx) / 2);
  });
  it('honours width and height fit', () => {
    const t = { beadType: 'delica11' as const, width: 10, height: 10 };
    expect(computeFit(10, 100, t, 0, 'width').mmPerPx).toBeCloseTo(1.6);
    expect(computeFit(100, 10, t, 0, 'height').mmPerPx).toBeCloseTo(1.3);
  });
  it('stretches each axis to the margin box', () => {
    const f = computeFit(100, 50, { beadType: 'delica11', width: 12, height: 20 }, 1, 'stretch');
    expect(f.mmPerPx).toBeCloseTo((10 * 1.6) / 100);
    expect(f.mmPerPxY).toBeCloseTo((18 * 1.3) / 50);
    expect(f.ox).toBeCloseTo(1.6);
    expect(f.oy).toBeCloseTo(1.3);
    expect(
      computeFit(100, 50, { beadType: 'delica11', width: 12, height: 20 }, 1, 'contain').mmPerPxY,
    ).toBe((10 * 1.6) / 100);
  });
});

describe('resolveFit / resolveMargin', () => {
  it('auto fit stretches full-bleed images, contains keyed ones; explicit modes stay', () => {
    expect(resolveFit('auto', 'none')).toBe('stretch');
    for (const m of ['alpha', 'borderKey', 'threshold'] as const)
      expect(resolveFit('auto', m)).toBe('contain');
    expect(resolveFit('contain', 'none')).toBe('contain');
    expect(DEFAULT_SETTINGS.fit).toBe('auto');
  });
  it('auto margin is 0 when stretching', () => {
    expect(resolveMargin(DEFAULT_SETTINGS, 'panel', 'contain')).toBe(1);
    expect(resolveMargin(DEFAULT_SETTINGS, 'panel', 'stretch')).toBe(0);
    expect(resolveMargin({ ...DEFAULT_SETTINGS, margin: 2 }, 'panel', 'stretch')).toBe(2);
  });
});

describe('rasterise', () => {
  const fit = { mmPerPx: 1.6 / 10, mmPerPxY: 1.6 / 10, ox: 0, oy: 0 };
  const base = {
    width: 3,
    height: 1,
    beadType: 'delica11' as const,
    supersample: 10,
    coverage: 0.5,
  };
  /** 30x9 px raster: label 0 (white) everywhere, `k` pixels of label 1 in the middle bead. */
  function raster(k: number): { labels: Int16Array; weights: Float32Array; w: number; h: number } {
    const w = 30;
    const h = 9;
    const labels = new Int16Array(w * h);
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 10; x < 20; x++) if (n++ < k) labels[y * w + x] = 1;
    return { labels, weights: new Float32Array(w * h).fill(1), w, h };
  }

  it('lets a detail colour at >= detailThreshold beat the majority', () => {
    const { labels, weights, w, h } = raster(36);
    const cells = rasterise({
      ...base,
      labels,
      weights,
      cover: weights,
      imgW: w,
      imgH: h,
      fit,
      detail: [false, true],
      detailThreshold: 0.3,
    });
    expect(cells[0]).toEqual([0, 1, 0]);
  });

  it('uses the majority below detailThreshold', () => {
    const { labels, weights, w, h } = raster(18);
    const cells = rasterise({
      ...base,
      labels,
      weights,
      cover: weights,
      imgW: w,
      imgH: h,
      fit,
      detail: [false, true],
      detailThreshold: 0.3,
    });
    expect(cells[0]).toEqual([0, 0, 0]);
  });

  it('leaves beads under the coverage threshold empty', () => {
    const w = 30;
    const h = 9;
    const labels = new Int16Array(w * h).fill(-1);
    for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) labels[y * w + x] = 0;
    const cells = rasterise({
      ...base,
      labels,
      weights: new Float32Array(w * h).fill(1),
      cover: new Float32Array(w * h).fill(1),
      imgW: w,
      imgH: h,
      fit,
      detail: [false],
      detailThreshold: 0.3,
    });
    expect(cells[0]).toEqual([-1, -1, -1]);
  });
});

describe('makeUnmix', () => {
  const pal = [W, G, K].map((e) => e.hex);
  const unmix = makeUnmix([255, 255, 255], pal);
  it('unmixes a blend with the background to the most distant fitting colour', () => {
    const u = unmix(128, 128, 128);
    expect(u?.label).toBe(2);
    expect(u?.t).toBeCloseTo(0.5, 1);
  });
  it('returns null for colours off every background ray', () => {
    expect(makeUnmix([255, 255, 255], [W.hex, K.hex])(208, 32, 32)).toBeNull();
  });
});

describe('despeckle', () => {
  it('replaces a non-detail singleton with its neighbours majority, keeps detail ones', () => {
    const cells = [
      [0, 0, 0],
      [0, 1],
      [0, 0, 0],
    ];
    expect(despeckle(cells, [false, false])[1]).toEqual([0, 0]);
    expect(despeckle(cells, [false, true])[1]).toEqual([0, 1]);
  });
});

describe('analyseImage', () => {
  it('renders a centred filled circle as a mirror-symmetric pattern', () => {
    const img = render(300, 300, (x, y) => (x - 150) ** 2 + (y - 150) ** 2 <= 120 ** 2);
    const { pattern } = analyseImage(img, shapedTarget(21, 25), [W, K], DEFAULT_SETTINGS);
    expect(ids(pattern)).toEqual(new Set(['k']));
    for (const row of pattern.cells) expect([...row].reverse()).toEqual(row);
  });

  it('keeps a 1-px diagonal stroke as a line without thinLine warnings at high sensitivity', () => {
    const img = render(400, 400, (x, y) => Math.abs(x - y) < 0.5 && x > 20 && x < 380);
    const { pattern } = analyseImage(
      img,
      shapedTarget(30, 36),
      [W, K],
      settings({ lineSensitivity: 1 }),
    );
    expect(colourCounts(pattern).get('k') ?? 0).toBeGreaterThan(20);
    expect(ids(pattern)).toEqual(new Set(['k']));
    expect(analyse(pattern).warnings.filter((w) => w.code === 'thinLine')).toEqual([]);
  });

  it('lets a small detail dot win over white', () => {
    const img = render(200, 200, () => false, [0, 0, 0, 255], [0, 0, 0, 0]);
    paint(img, (x, y) => x > 20 && x < 180 && y > 20 && y < 180, [255, 255, 255, 255]);
    paint(img, (x, y) => (x - 100) ** 2 + (y - 100) ** 2 <= 4 ** 2, [0, 0, 0, 255]);
    const { pattern } = analyseImage(
      img,
      shapedTarget(20, 24),
      [W, KD],
      settings({ lineSensitivity: 0 }),
    );
    expect(colourCounts(pattern).get('k') ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('maps an anti-aliased black stroke on white without ghost grey beads (R8)', () => {
    const img = render(
      400,
      400,
      (x, y) => Math.abs(x - y * 0.7 - 60) < 9 && y > 20 && y < 380,
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      4,
    );
    for (const mode of ['shaped', 'panel'] as const) {
      const { pattern } = analyseImage(
        img,
        { ...shapedTarget(30, 36), mode },
        [W, G, K],
        DEFAULT_SETTINGS,
      );
      expect(colourCounts(pattern).get('g') ?? 0).toBe(0);
      expect(colourCounts(pattern).get('k') ?? 0).toBeGreaterThan(30);
    }
  });

  it('respects maxColors and is deterministic', () => {
    const img = render(240, 240, () => false);
    const cols: Rgba[] = [
      [208, 32, 32, 255],
      [32, 64, 208, 255],
      [128, 128, 128, 255],
      [0, 0, 0, 255],
    ];
    cols.forEach((c, i) =>
      paint(img, (x, y) => x > 20 + i * 50 && x < 70 + i * 50 && y > 30 && y < 210, c),
    );
    const s = settings({ maxColors: 2 });
    const a = analyseImage(img, { ...shapedTarget(30, 30), mode: 'panel' }, [W, G, K, R, B], s);
    const b = analyseImage(img, { ...shapedTarget(30, 30), mode: 'panel' }, [W, G, K, R, B], s);
    expect(ids(a.pattern).size).toBeLessThanOrEqual(2);
    expect(a.usedPalette.length).toBeLessThanOrEqual(2);
    expect(a.pattern).toEqual(b.pattern);
  });

  it('fills every panel cell', () => {
    const img = render(100, 100, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 <= 30 ** 2);
    const { pattern } = analyseImage(
      img,
      { ...shapedTarget(20, 20), mode: 'panel' },
      [W, K],
      DEFAULT_SETTINGS,
    );
    expect(pattern.cells.flat().every((c) => c !== null)).toBe(true);
    expect(ids(pattern)).toEqual(new Set(['w', 'k']));
  });

  it('uses alpha mode for transparent input', () => {
    const img = render(
      120,
      120,
      (x, y) => x > 30 && x < 90 && y > 10 && y < 110,
      [208, 32, 32, 255],
      [255, 255, 255, 0],
    );
    const r = analyseImage(img, shapedTarget(16, 20), [W, R], DEFAULT_SETTINGS);
    expect(r.stats.background).toBe('alpha');
    expect(ids(r.pattern)).toEqual(new Set(['r']));
  });

  it('keeps a white interior enclosed by a black outline with borderKey', () => {
    const img = render(200, 200, (x, y) => {
      const d = Math.hypot(x - 100, y - 100);
      return d <= 80 && d >= 70;
    });
    const r = analyseImage(
      img,
      shapedTarget(20, 24),
      [W, K],
      settings({ background: 'borderKey' }),
    );
    expect(r.stats.background).toBe('borderKey');
    const c = colourCounts(r.pattern);
    expect(c.get('w') ?? 0).toBeGreaterThan(50);
    expect(c.get('k') ?? 0).toBeGreaterThan(20);
    const mid = r.pattern.cells[12]!;
    expect(mid[Math.floor(mid.length / 2)]).toBe('w');
  });

  it('returns an empty shaped pattern for an empty image', () => {
    const img = render(50, 50, () => false);
    const r = analyseImage(img, shapedTarget(10, 10), [W, K], DEFAULT_SETTINGS);
    expect(r.pattern.cells.flat().every((c) => c === null)).toBe(true);
    expect(r.usedPalette).toEqual([]);
  });

  it('fills the panel with the dominant colour when there is no background (M1)', () => {
    const img = render(100, 100, (x, y) => x > 40 && x < 60 && y > 40 && y < 60);
    const r = analyseImage(
      img,
      { ...shapedTarget(20, 20), mode: 'panel' },
      [W, R, K, B],
      settings({ background: 'none' }),
    );
    expect(r.stats.panelBackground).toBe('w');
    expect(ids(r.pattern)).toEqual(new Set(['w', 'k']));
  });

  for (const width of [1, 1.5])
    for (const lineSensitivity of [0.5, 1])
      it(`maps a ${width}-px anti-aliased stroke to black, not grey (s=${lineSensitivity})`, () => {
        const img = render(
          400,
          400,
          (x, y) => Math.abs(x - y * 0.7 - 60) < width / 2 && y > 20 && y < 380,
          [0, 0, 0, 255],
          [255, 255, 255, 255],
          4,
        );
        const r = analyseImage(img, shapedTarget(30, 36), [W, G, K], settings({ lineSensitivity }));
        expect(colourCounts(r.pattern).get('g') ?? 0).toBe(0);
        expect(colourCounts(r.pattern).get('k') ?? 0).toBeGreaterThan(20);
      });

  it('keeps a genuinely grey region grey', () => {
    const img = render(
      200,
      200,
      (x, y) => (x - 100) ** 2 + (y - 100) ** 2 <= 70 ** 2,
      [128, 128, 128, 255],
      [255, 255, 255, 255],
      4,
    );
    const c = colourCounts(
      analyseImage(img, shapedTarget(20, 24), [W, G, K], DEFAULT_SETTINGS).pattern,
    );
    expect(c.get('g') ?? 0).toBeGreaterThan(100);
    expect(c.get('k') ?? 0).toBe(0);
  });

  it('picks alpha mode only when >= 0.5 % of pixels are transparent', () => {
    const img = render(100, 100, (x, y) => x > 30 && x < 70 && y > 30 && y < 70);
    img.data[3] = 249;
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('borderKey');
    for (let p = 0; p < 50; p++) img.data[p * 4 + 3] = 0;
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('alpha');
  });

  it('auto keys a white motif with a black outline on white (R30)', () => {
    const img = render(200, 200, (x, y) => Math.abs(Math.hypot(x - 100, y - 100) - 60) <= 5);
    paint(img, (x, y) => Math.hypot(x - 100, y - 100) < 55, [250, 250, 250, 255]);
    const r = analyseImage(img, shapedTarget(20, 24), [W, K], DEFAULT_SETTINGS);
    expect(r.stats.background).toBe('borderKey');
    const c = colourCounts(r.pattern);
    expect(c.get('w') ?? 0).toBeGreaterThan(50);
    expect(c.get('k') ?? 0).toBeGreaterThan(20);
    expect(r.pattern.cells[0]![0]).toBeNull();
    const mid = r.pattern.cells[12]!;
    expect(mid[Math.floor(mid.length / 2)]).toBe('w');
  });

  it('auto treats a mildly noisy border around one colour as uniform (R30)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 24 - 12;
    const img = render(120, 120, (x, y) => x > 40 && x < 80 && y > 40 && y < 80);
    for (let p = 0; p < 120 * 120; p++)
      if (img.data[p * 4]! > 128)
        for (let c = 0; c < 3; c++) img.data[p * 4 + c] = 200 + Math.round(rnd()) + 6 * c;
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('borderKey');
  });

  it('analyses 1024x1024 to a 40x60 shaped target (perf report)', () => {
    const img = render(1024, 1024, (x, y) => {
      const d = Math.hypot(x - 512, (y - 512) * 1.3);
      return d < 420 && !(d > 200 && d < 206);
    });
    paint(img, (x, y) => Math.hypot(x - 420, y - 400) < 40, [208, 32, 32, 255]);
    const t0 = performance.now();
    const r = analyseImage(img, shapedTarget(40, 60), [W, G, K, R, B], DEFAULT_SETTINGS);
    const ms = performance.now() - t0;
    console.log(`analyseImage 1024² → 40×60: ${ms.toFixed(0)} ms`, r.stats.timings);
    expect(ms).toBeLessThan(5000);
  });
});

describe('despeckledBeads (R52.11)', () => {
  const dots = (): RgbaImage => {
    const img = render(220, 220, () => false, [0, 0, 0, 255], [255, 255, 255, 255]);
    for (const [cx, cy] of [
      [60, 60],
      [150, 90],
      [100, 160],
      [40, 180],
      [180, 30],
    ] as const)
      paint(img, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= 6 ** 2, [0, 0, 0, 255]);
    return img;
  };
  const target: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 20, height: 30 };
  const s = settings({ lineSensitivity: 0, background: 'none' });
  const diff = (a: Pattern, b: Pattern): number =>
    a.cells.reduce((n, row, r) => n + row.filter((c, i) => c !== b.cells[r]![i]).length, 0);

  const flagged = [W, K, { ...R, detail: true }];

  it('counts the cells despeckle changed', () => {
    const on = analyseImage(dots(), target, flagged, s);
    const off = analyseImage(dots(), target, flagged, { ...s, despeckle: false });
    expect(diff(on.pattern, off.pattern)).toBeGreaterThan(0);
    expect(on.stats.despeckledBeads).toBe(diff(on.pattern, off.pattern));
  });

  it('is 0 when despeckle is off', () => {
    const off = analyseImage(dots(), target, [W, K], { ...s, despeckle: false });
    expect(off.stats.despeckledBeads).toBe(0);
  });
});
