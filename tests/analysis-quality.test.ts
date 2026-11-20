import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AnalysisSettings, type AnalysisTarget } from '../src/core/analysis';
import { SEED_CATALOG, paletteEntryFromSeed } from '../src/core/palette/catalog';
import { hexToLab } from '../src/core/palette/color';
import * as images from './quality/images';
import { dominantColour, measure, type Measure } from './quality/metrics';

/**
 * Quality benchmark of `analyseImage` on synthetic images with ground truth (SPEC §5.2). Floors
 * guard today's behaviour; `it.fails` records targets that later steps must meet (each flips to a
 * failing test once met, so it must then be turned into a plain `it`).
 */

declare const process: { env: Record<string, string | undefined> };

const catalogue = SEED_CATALOG.map((s) => paletteEntryFromSeed(s, `seed:${s.db}`));
const shaped = (width: number, height: number): AnalysisTarget => ({
  beadType: 'delica11',
  mode: 'shaped',
  width,
  height,
});
const panel = (width: number, height: number): AnalysisTarget => ({
  ...shaped(width, height),
  mode: 'panel',
});

interface Case {
  readonly q: images.QualityImage;
  readonly m: Measure;
}

const cache = new Map<string, Case>();
const defs: Record<string, () => [images.QualityImage, AnalysisTarget, Partial<AnalysisSettings>]> =
  {
    smiley: () => [images.smiley(), shaped(30, 36), {}],
    'smiley-noise': () => [images.smiley(8), shaped(30, 36), {}],
    'smiley-6c': () => [images.smiley(), shaped(30, 36), { maxColors: 6 }],
    flower: () => [images.flower(), panel(28, 46), { maxColors: 5 }],
    'flower-noise': () => [images.flower(8), panel(28, 46), { maxColors: 5 }],
    landscape: () => [images.landscape(), panel(40, 37), { maxColors: 6 }],
    'landscape-noise': () => [images.landscape(8), panel(40, 37), { maxColors: 6 }],
    whiteOnWhite: () => [images.whiteOnWhite(), shaped(30, 30), {}],
    'whiteOnWhite-6c': () => [images.whiteOnWhite(), shaped(30, 30), { maxColors: 6 }],
    twoToneBorder: () => [images.twoToneBorder(), shaped(30, 30), {}],
    hazyBeach: () => [images.hazyBeach(), panel(40, 30), { maxColors: 5 }],
  };

function get(name: string): Case {
  let c = cache.get(name);
  if (!c) {
    const [q, target, s] = defs[name]!();
    c = { q, m: measure(q, target, catalogue, { ...DEFAULT_SETTINGS, ...s }) };
    cache.set(name, c);
  }
  return c;
}

const region = (c: Case, name: string): number => c.q.regions.indexOf(name);
const de = (name: string, r: string): number => {
  const c = get(name);
  return c.m.regionDE[region(c, r)]!;
};
const recall = (name: string, r: string): number => {
  const c = get(name);
  return c.m.recall[region(c, r)]!;
};
const beadsOf = (name: string, r: string): Map<string, number> => {
  const c = get(name);
  return c.m.tally[region(c, r)]!;
};
const total = (t: ReadonlyMap<string, number>): number =>
  [...t.values()].reduce((a, b) => a + b, 0);
const shareWhere = (t: ReadonlyMap<string, number>, pred: (hex: string) => boolean): number =>
  [...t].filter(([h]) => pred(h)).reduce((a, [, k]) => a + k, 0) / Math.max(1, total(t));
const isGrey = (hex: string): boolean => Math.hypot(hexToLab(hex).a, hexToLab(hex).b) < 15;
const isBlack = (hex: string): boolean => hexToLab(hex).L < 25;

const SLOW = 20000;

describe('floors (today)', () => {
  it('smiley: outline, eyes and mouth keep their colours, mask is exact', { timeout: SLOW }, () => {
    expect(get('smiley').m.iou).toBeGreaterThan(0.98);
    for (const r of ['outline', 'eyes', 'mouth']) expect(recall('smiley', r)).toBeGreaterThan(0.9);
    expect(get('smiley').m.meanDE).toBeLessThan(14);
    expect(get('smiley').m.beads).toBeGreaterThan(750);
  });
  it('smiley with 6 colours: cheeks are pink', { timeout: SLOW }, () => {
    expect(de('smiley-6c', 'cheeks')).toBeLessThan(12);
  });
  it('smiley with noise: mask and outline hold', { timeout: SLOW }, () => {
    expect(get('smiley-noise').m.iou).toBeGreaterThan(0.97);
    expect(recall('smiley-noise', 'outline')).toBeGreaterThan(0.9);
  });
  it('flower: centre is yellow, mask is good, error bounded', { timeout: SLOW }, () => {
    expect(recall('flower', 'centre')).toBeGreaterThan(0.9);
    expect(get('flower').m.iou).toBeGreaterThan(0.95);
    expect(get('flower').m.meanDE).toBeLessThan(19);
  });
  it('landscape: sky, wall and roof are right, error bounded', { timeout: SLOW }, () => {
    expect(recall('landscape', 'sky')).toBeGreaterThan(0.9);
    expect(recall('landscape', 'wall')).toBeGreaterThan(0.8);
    expect(recall('landscape', 'roof')).toBeGreaterThan(0.9);
    expect(get('landscape').m.meanDE).toBeLessThan(11.5);
    expect(get('landscape').m.beads).toBeGreaterThan(1400);
  });
  it('landscape with noise: sky and wall hold, full bleed', { timeout: SLOW }, () => {
    expect(recall('landscape-noise', 'sky')).toBeGreaterThan(0.9);
    expect(recall('landscape-noise', 'wall')).toBeGreaterThan(0.9);
    expect(get('landscape-noise').m.beads).toBeGreaterThan(1400);
  });
  it('whiteOnWhite: the black tail tip is found and the run finishes', { timeout: SLOW }, () => {
    expect(isBlack(dominantColour(beadsOf('whiteOnWhite', 'tail')) ?? '#ffffff')).toBe(true);
    expect(get('whiteOnWhite-6c').m.beads).toBeGreaterThan(0);
  });
  it('twoToneBorder: sky and snow keep their colours', { timeout: SLOW }, () => {
    expect(recall('twoToneBorder', 'sky')).toBeGreaterThan(0.9);
    expect(recall('twoToneBorder', 'snow')).toBeGreaterThan(0.9);
  });
  it('whiteOnWhite: the motif survives the background removal', { timeout: SLOW }, () => {
    expect(get('whiteOnWhite').m.iou).toBeGreaterThan(0.55);
    expect(get('whiteOnWhite').m.beads).toBeGreaterThan(300);
  });
});

describe('full-bleed photos are not keyed away (R59.1)', () => {
  it(
    'hazyBeach: soft sky, sea and sand transitions keep the whole picture',
    { timeout: SLOW },
    () => {
      expect(get('hazyBeach').m.iou).toBeGreaterThan(0.95);
    },
  );
});

describe('targets (it.fails until fixed)', () => {
  it('smiley with 4 colours: cheeks get pink, not red', { timeout: SLOW }, () => {
    expect(de('smiley', 'cheeks')).toBeLessThan(12);
  });
  it('landscape: the sun is yellow', { timeout: SLOW }, () => {
    expect(de('landscape', 'sun')).toBeLessThan(12);
  });
  it('landscape: the door is brown, not red', { timeout: SLOW }, () => {
    expect(de('landscape', 'door')).toBeLessThan(15);
  });
  it('landscape with noise: the roof stays red', { timeout: SLOW }, () => {
    expect(de('landscape-noise', 'roof')).toBeLessThan(12);
  });
  it('flower: stem and leaf are green', { timeout: SLOW }, () => {
    expect(de('flower', 'stem')).toBeLessThan(12);
    expect(de('flower', 'leaf')).toBeLessThan(12);
  });
  it('flower: petals are not grey', { timeout: SLOW }, () => {
    expect(shareWhere(beadsOf('flower', 'petals'), isGrey)).toBeLessThan(0.1);
  });
  it('flower with noise: mask IoU at least 0.97', { timeout: SLOW }, () => {
    expect(get('flower-noise').m.iou).toBeGreaterThanOrEqual(0.97);
  });
  it('flower with noise: bead count within 5 % of the clean image', { timeout: SLOW }, () => {
    const clean = get('flower').m.beads;
    expect(Math.abs(get('flower-noise').m.beads - clean) / clean).toBeLessThanOrEqual(0.05);
  });
  it.fails('whiteOnWhite: mask IoU at least 0.95 at default settings', { timeout: SLOW }, () => {
    expect(get('whiteOnWhite').m.iou).toBeGreaterThanOrEqual(0.95);
  });
  it(
    'whiteOnWhite: no black beads on the body and head beyond true dark features',
    { timeout: SLOW },
    () => {
      const t = new Map<string, number>();
      for (const r of ['body', 'head'])
        for (const [h, k] of beadsOf('whiteOnWhite', r)) t.set(h, (t.get(h) ?? 0) + k);
      expect(total(t)).toBeGreaterThan(100);
      expect(shareWhere(t, isBlack)).toBeLessThan(0.03);
    },
  );
  it('whiteOnWhite: red comb present with 6 colours', { timeout: SLOW }, () => {
    expect(de('whiteOnWhite-6c', 'comb')).toBeLessThan(20);
  });
  it.fails('twoToneBorder: object mask IoU at least 0.85', { timeout: SLOW }, () => {
    expect(get('twoToneBorder').m.iou).toBeGreaterThanOrEqual(0.85);
  });
});

afterAll(() => {
  if (!process.env.BENCH_REPORT) return;
  const f = (x: number, d = 1): string => (Number.isNaN(x) ? '-' : x.toFixed(d));
  const lines = ['case | beads colours meanDE p90DE IoU'];
  for (const name of Object.keys(defs)) {
    const { q, m } = get(name);
    lines.push(
      `${name} | ${m.beads} ${m.analysis.pattern.palette.length} ${f(m.meanDE)} ${f(m.p90DE)} ${f(m.iou, 3)}`,
    );
    q.regions.forEach((r, g) => {
      if (!total(m.tally[g]!)) return;
      const cols = [...m.tally[g]!].map(([h, k]) => `${h}x${k}`).join(' ');
      lines.push(`    ${r}: recall ${f(m.recall[g]!, 2)} dE ${f(m.regionDE[g]!)} | ${cols}`);
    });
  }
  console.log(lines.join('\n'));
});
