import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/analysis';
import { foregroundMask, spansOppositeSides } from '../src/core/analysis/prepare';
import { createMask, maskCount, type RgbaImage } from '../src/core/imaging';

type Rgb = readonly [number, number, number];

function image(w: number, h: number, f: (x: number, y: number) => Rgb): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const noise = (x: number, y: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 2;
};

const SKY: Rgb = [90, 150, 225];
const SNOW: Rgb = [250, 250, 252];
const BIRD: Rgb = [200, 60, 60];
const inBox = (x: number, y: number, lo: number, hi: number) =>
  x >= lo && x < hi && y >= lo && y < hi;
const inBird = (x: number, y: number) => Math.hypot(x - 100, y - 90) < 30;

describe('foregroundMask background removal (R59.1)', () => {
  it('auto keys sky over a soft horizon over snow, keeping the motif', () => {
    const img = image(200, 200, (x, y) =>
      inBird(x, y) ? BIRD : mix(SKY, SNOW, Math.min(1, Math.max(0, (y - 110) / 10))),
    );
    const { mask, mode } = foregroundMask(img, DEFAULT_SETTINGS);
    expect(mode).toBe('borderKey');
    const area = maskCount({ width: 200, height: 200, data: mask.data });
    expect(Math.abs(area - Math.PI * 30 * 30)).toBeLessThan(100);
  });

  it('auto leaves two fields meeting at a sharp edge (a flag) whole', () => {
    const img = image(200, 200, (x) => (x < 100 ? [200, 20, 30] : [0, 40, 170]));
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('none');
  });

  it('derives the tolerance from the background noise: noisy backgrounds key out cleanly', () => {
    const img = image(200, 200, (x, y) => {
      if (inBird(x, y)) return BIRD;
      const n = noise(x, y) * 9;
      return [200 + n, 215 + n, 240 + n];
    });
    const { mask, mode } = foregroundMask(img, DEFAULT_SETTINGS);
    expect(mode).toBe('borderKey');
    const area = maskCount(mask);
    expect(Math.abs(area - Math.PI * 30 * 30)).toBeLessThan(150);
  });

  it('a quiet background keeps a motif that is only slightly darker than it', () => {
    const img = image(200, 200, (x, y) => (inBird(x, y) ? [244, 244, 244] : [253, 253, 253]));
    const area = maskCount(foregroundMask(img, DEFAULT_SETTINGS).mask);
    expect(area).toBeGreaterThan(0.85 * Math.PI * 30 * 30);
  });

  it('removes foreground specks before the crop box is taken', () => {
    const img = image(200, 200, (x, y) => (inBird(x, y) || (x === 5 && y === 5) ? BIRD : SNOW));
    const { mask } = foregroundMask(img, DEFAULT_SETTINGS);
    expect(mask.data[5 * 200 + 5]).toBe(0);
    expect(mask.data[90 * 200 + 100]).toBe(1);
  });

  it('a manual tolerance is a flat cap around every seed', () => {
    const img = image(100, 100, (x, y) =>
      Math.hypot(x - 50, y - 50) < 20 ? [225, 225, 225] : SNOW,
    );
    const manual = (borderKeyTolerance: number) =>
      maskCount(foregroundMask(img, { ...DEFAULT_SETTINGS, borderKeyTolerance }).mask);
    expect(manual(2)).toBeGreaterThan(1000);
    expect(manual(40)).toBe(0);
  });

  it('keeps a 40 px icon on a 2048 px quiet white canvas', () => {
    const img = image(2048, 2048, (x, y) =>
      inBox(x, y, 1000, 1040) ? [30, 80, 160] : [255, 255, 255],
    );
    const { mask, mode } = foregroundMask(img, DEFAULT_SETTINGS);
    expect(mode).toBe('borderKey');
    expect(maskCount(mask)).toBeGreaterThan(1500);
  });

  it('keeps a small motif on a noisy background when it is wide enough', () => {
    const img = image(512, 512, (x, y) => {
      const n = noise(x, y) * 9;
      return Math.hypot(x - 256, y - 256) < 14
        ? [BIRD[0] + n, BIRD[1] + n, BIRD[2] + n]
        : [200 + n, 215 + n, 240 + n];
    });
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('borderKey');
  });

  it('falls back to none when a noisy background leaves only a sliver', () => {
    const img = image(400, 400, (x, y) => {
      const n = noise(x, y) * 9;
      return x > 200 && x < 203 && y > 80 && y < 320
        ? [120 + n, 140 + n, 180 + n]
        : [200 + n, 215 + n, 240 + n];
    });
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('none');
  });

  it('keeps a thin line drawing on a quiet background', () => {
    const img = image(400, 400, (x, y) => (Math.abs(x - y) < 1 ? [0, 0, 0] : [255, 255, 255]));
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('borderKey');
  });

  it('keeps a detached dot that fills a bead, drops one smaller than a bead', () => {
    const img = image(400, 400, (x, y) =>
      inBird(x, y) || inBox(x, y, 20, 24) || (x === 380 && y === 10) ? BIRD : SNOW,
    );
    const alone = foregroundMask(img, DEFAULT_SETTINGS);
    expect(alone.mask.data[22 * 400 + 22]).toBe(0);
    const beaded = foregroundMask(img, DEFAULT_SETTINGS, 30 * 34);
    expect(beaded.mask.data[22 * 400 + 22]).toBe(1);
    expect(beaded.mask.data[10 * 400 + 380]).toBe(0);
  });

  it('two seeds with a hazy band that leaves streaks reaching both sides resolve to none', () => {
    const img = image(300, 300, (x, y) => {
      if (inBox(x, y, 120, 180)) return BIRD;
      if (y > 140 && y < 156) return [252, 252, 252];
      return y < 148 ? [58, 138, 198] : [201, 214, 226];
    });
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('none');
  });

  it('a single seed may touch opposite sides (snow along the bottom and sides)', () => {
    const img = image(300, 300, (x, y) =>
      inBox(x, y, 100, 200) || (y > 100 && y < 160 && (x < 10 || x > 290)) ? BIRD : SNOW,
    );
    expect(foregroundMask(img, DEFAULT_SETTINGS).mode).toBe('borderKey');
  });

  it('spansOppositeSides: separate parts on opposite sides, or one thin or scenery-wide part', () => {
    const band = (rows: number, y0 = 40) => {
      const m = createMask(100, 100);
      for (let x = 0; x < 100; x++) for (let y = y0; y < y0 + rows; y++) m.data[y * 100 + x] = 1;
      return m;
    };
    expect(spansOppositeSides(band(2), 0.01)).toBe(true);
    expect(spansOppositeSides(band(12), 0.01)).toBe(false);
    expect(spansOppositeSides(band(20), 0.01)).toBe(true);
    const sides = createMask(100, 100);
    for (let y = 30; y < 60; y++)
      for (const x of [0, 1, 2, 97, 98, 99]) sides.data[y * 100 + x] = 1;
    expect(spansOppositeSides(sides, 0.01)).toBe(true);
    const one = createMask(100, 100);
    for (let y = 20; y < 80; y++) for (let x = 0; x < 10; x++) one.data[y * 100 + x] = 1;
    expect(spansOppositeSides(one, 0.01)).toBe(false);
  });
});

const box = (m: { width: number; height: number; data: Uint8Array }) => {
  let x0 = m.width;
  let x1 = -1;
  let y0 = m.height;
  let y1 = -1;
  for (let p = 0; p < m.data.length; p++)
    if (m.data[p]) {
      const x = p % m.width;
      const y = (p - x) / m.width;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1].map((v) => v / m.width);
};

describe('full resolution follows the plan (R59.1)', () => {
  const scene = (n: number) =>
    image(n, n, (x, y) => {
      const e = noise(x, y) * 2;
      if (Math.hypot(x - n / 2, y - 0.75 * n) < 0.1 * n) return [200 + e, 40 + e, 40 + e];
      const t = Math.min(1, Math.max(0, (y - n / 2) / Math.max(4, n / 50) + 0.5));
      return [0, 1, 2].map(
        (k) => [120, 170, 230][k]! * (1 - t) + [244, 246, 250][k]! * t + e,
      ) as unknown as Rgb;
    });
  it('a 2048 px picture keys the same box as its 512 px version', () => {
    const small = foregroundMask(scene(512), DEFAULT_SETTINGS, 1600);
    const large = foregroundMask(scene(2048), DEFAULT_SETTINGS, 1600);
    expect(small.mode).toBe('borderKey');
    expect(large.mode).toBe('borderKey');
    const a = box(small.mask);
    const b = box(large.mask);
    for (let i = 0; i < 4; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.01);
  });
});

describe('thin streaks reaching opposite sides (R59.1)', () => {
  const sky = (n: number, f: (x: number, y: number) => Rgb | null) =>
    image(n, n, (x, y) => {
      const e = noise(x, y) * 2;
      const c = f(x, y);
      if (c) return [c[0] + e, c[1] + e, c[2] + e];
      const t = Math.min(1, Math.max(0, (y - n / 2) / 8 + 0.5));
      return [0, 1, 2].map(
        (k) => [120, 170, 230][k]! * (1 - t) + [244, 246, 250][k]! * t + e,
      ) as unknown as Rgb;
    });
  const bar =
    (half: number, x0 = 0, x1 = 400): ((x: number, y: number) => Rgb | null) =>
    (x, y) =>
      Math.abs(y - 320) < half && x >= x0 && x < x1 ? [90, 80, 70] : null;
  it('a thin full-width streak resolves to none, a thick bar and an inset bar stay keyed', () => {
    const disc = (x: number, y: number): Rgb | null =>
      Math.hypot(x - 200, y - 200) < 50 ? [200, 40, 40] : null;
    const both = (f: (x: number, y: number) => Rgb | null) => (x: number, y: number) =>
      disc(x, y) ?? f(x, y);
    expect(foregroundMask(sky(400, both(bar(3))), DEFAULT_SETTINGS).mode).toBe('none');
    expect(foregroundMask(sky(400, both(bar(12))), DEFAULT_SETTINGS).mode).toBe('borderKey');
    expect(foregroundMask(sky(400, both(bar(12, 40, 360))), DEFAULT_SETTINGS).mode).toBe(
      'borderKey',
    );
  });
  it('separate discs on both side edges mean the key failed', () => {
    const f = (x: number, y: number): Rgb | null =>
      Math.hypot(x - 200, y - 200) < 50 ||
      Math.hypot(x, y - 330) < 30 ||
      Math.hypot(x - 400, y - 330) < 30
        ? [200, 40, 40]
        : null;
    expect(foregroundMask(sky(400, f), DEFAULT_SETTINGS).mode).toBe('none');
  });
});
