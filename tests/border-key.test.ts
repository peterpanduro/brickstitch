import { describe, expect, it } from 'vitest';
import {
  adaptiveKey,
  borderSeeds,
  createMask,
  keyedMask,
  planKeying,
  maskCount,
  removeSpecks,
  type KeySeed,
  type Mask,
  type RgbaImage,
} from '../src/core/imaging';
import { rgbToLab } from '../src/core/palette/color';
import { deltaE2000 } from '../src/core/palette/deltaE';

type Rgb = readonly [number, number, number];

const dist = (a: Rgb, b: Rgb) => deltaE2000(rgbToLab(a), rgbToLab(b));

function image(w: number, h: number, f: (x: number, y: number) => Rgb): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const inBox = (x: number, y: number, lo: number, hi: number) =>
  x >= lo && x < hi && y >= lo && y < hi;

const withKey = (seeds: ReturnType<typeof borderSeeds>, step: number, cap: number) =>
  seeds.map((s) => ({ ...s, step, cap }));

describe('borderSeeds', () => {
  it('finds one seed per substantial border colour, largest first', () => {
    const img = image(40, 40, (_, y) => (y < 24 ? [90, 150, 225] : [250, 250, 252]));
    const seeds = borderSeeds(img, dist);
    expect(seeds.map((s) => s.rgb)).toEqual([
      [90, 150, 225],
      [250, 250, 252],
    ]);
    expect(seeds[0]!.share).toBeGreaterThan(seeds[1]!.share);
  });
  it('ignores a colour with a small border share', () => {
    const img = image(40, 40, (x, y) => (y === 0 && x < 4 ? [255, 0, 0] : [250, 250, 250]));
    expect(borderSeeds(img, dist)).toHaveLength(1);
  });
  it('merges a noisy border into one cluster and reports its noise', () => {
    const img = image(60, 20, (x) => [200 + (x % 5), 200, 200]);
    const seeds = borderSeeds(img, dist);
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.noise).toBeGreaterThan(0);
  });
  it('returns a seed even when no cluster is substantial', () => {
    const img = image(40, 40, (x, y) => [(x * 6) % 256, (y * 6) % 256, (x * y) % 256]);
    expect(borderSeeds(img, dist).length).toBeGreaterThan(0);
  });
  it('is empty for an empty image', () => {
    expect(borderSeeds({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, dist)).toEqual([]);
  });
});

describe('adaptiveKey', () => {
  it('grows with the noise and stays inside sane bounds', () => {
    const quiet = adaptiveKey(0);
    const noisy = adaptiveKey(6);
    expect(noisy.step).toBeGreaterThan(quiet.step);
    expect(noisy.cap).toBeGreaterThan(quiet.cap);
    expect(quiet.cap).toBeGreaterThanOrEqual(1);
    expect(adaptiveKey(1000).cap).toBeLessThanOrEqual(30);
    for (const n of [0, 1, 6, 1000])
      expect(adaptiveKey(n).cap).toBeGreaterThanOrEqual(adaptiveKey(n).step);
  });
});

const flood = (img: RgbaImage, seeds: KeySeed[]) => keyedMask(img, dist, seeds);

describe('keyedMask (flood per seed)', () => {
  it('follows a gentle gradient that a flat tolerance cannot', () => {
    const img = image(60, 40, (x, y) => {
      const g = 255 - x * 2;
      return inBox(x, y, 25, 35) ? [20, 20, 20] : [g, g, g];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 4, cap: 40 };
    const flat = { ...seed, step: Infinity, cap: 4 };
    expect(maskCount(flood(img, [seed]))).toBe(100);
    expect(maskCount(flood(img, [flat]))).toBeGreaterThan(100);
  });
  it('does not creep past the cap into a region reached by small steps', () => {
    const img = image(60, 30, (x) => {
      const g = x < 30 ? 255 : 255 - (x - 30) * 3;
      return [g, g, g];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 4, cap: 12 };
    const fg = flood(img, [seed]);
    expect(fg.data[15 * 60 + 5]).toBe(0);
    expect(fg.data[15 * 60 + 55]).toBe(1);
  });
  it('unions the floods of several seeds', () => {
    const img = image(40, 40, (x, y) =>
      inBox(x, y, 15, 25) ? [10, 10, 10] : y < 20 ? [90, 150, 225] : [250, 250, 250],
    );
    const seeds = withKey(borderSeeds(img, dist), 3, 6);
    expect(seeds).toHaveLength(2);
    expect(maskCount(flood(img, seeds))).toBe(100);
  });
  it('keeps enclosed background-coloured regions', () => {
    const img = image(21, 21, (x, y) => {
      const r = Math.max(Math.abs(x - 10), Math.abs(y - 10));
      return r === 6 ? [0, 0, 0] : [255, 255, 255];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 3, cap: 6 };
    expect(maskCount(flood(img, [seed]))).toBe(169);
  });
});

describe('fringe', () => {
  const edge = image(40, 20, (x) =>
    x < 20
      ? [255, 255, 255]
      : x === 20
        ? [235, 235, 235]
        : x === 21
          ? [225, 225, 225]
          : x === 22
            ? [215, 215, 215]
            : [0, 0, 0],
  );
  const seed = { rgb: [255, 255, 255] as Rgb, step: 3, cap: 3 };
  it('keys a soft anti-aliased edge up to two pixels beyond the flood', () => {
    expect(maskCount(flood(edge, [seed]))).toBe(400);
    expect(maskCount(flood(edge, [{ ...seed, fringe: 20 }]))).toBe(360);
  });
  it('adaptive fringe is the anti-aliasing tolerance 12, or the cap when that is wider', () => {
    expect(adaptiveKey(0).fringe).toBe(12);
    expect(adaptiveKey(10).fringe).toBe(adaptiveKey(10).cap);
  });
});

describe('planKeying', () => {
  it('joins seeds across a soft horizon but not across a sharp edge', () => {
    const soft = image(40, 60, (_, y) => {
      const t = Math.min(1, Math.max(0, (y - 20) / 20));
      return [90 + 160 * t, 150 + 100 * t, 225 + 25 * t];
    });
    const s = withKey(borderSeeds(soft, dist), 8, 40);
    expect(s.length).toBeGreaterThan(1);
    expect(planKeying(soft, dist, s).used).toHaveLength(s.length);
    const sharp = image(40, 40, (_, y) => (y < 20 ? [90, 150, 225] : [250, 250, 250]));
    const two = withKey(borderSeeds(sharp, dist), 3, 6);
    expect(planKeying(sharp, dist, two).used).toHaveLength(1);
  });
  it('drops a seed split off by foreground (a flag, a motif touching the border)', () => {
    const wall = image(40, 40, (x) =>
      x < 18 ? [90, 150, 225] : x < 22 ? [200, 0, 0] : [250, 250, 250],
    );
    const two = withKey(borderSeeds(wall, dist), 3, 6);
    expect(two).toHaveLength(2);
    expect(planKeying(wall, dist, two).used).toHaveLength(1);
  });
  it('bridges a blurred horizon but keeps a disc whose colour lies on the seed line', () => {
    const SK: Rgb = [90, 150, 225];
    const SN: Rgb = [250, 250, 252];
    const mixc = (t: number): Rgb =>
      [0, 1, 2].map((c) => SK[c]! + t * (SN[c]! - SK[c]!)) as unknown as Rgb;
    const img = image(160, 160, (x, y) => {
      if (Math.hypot(x - 80, y - 80) < 28) return mixc(0.4);
      return mixc(Math.min(1, Math.max(0, (y - 76) / 8)));
    });
    const seeds = withKey(borderSeeds(img, dist), 2, 4);
    const plan = planKeying(img, dist, seeds);
    expect(plan.used).toHaveLength(2);
    const fg = keyedMask(img, dist, plan.used, { ...img, data: plan.bridge });
    expect(Math.abs(maskCount(fg) - Math.PI * 28 * 28)).toBeLessThan(0.06 * Math.PI * 28 * 28);
    expect(fg.data[80 * 160 + 80]).toBe(1);
  });
});

describe('removeSpecks', () => {
  const mk = (cells: [number, number][], w = 30, h = 30): Mask => {
    const m = createMask(w, h);
    for (const [x, y] of cells) m.data[y * w + x] = 1;
    return m;
  };
  const block = (x0: number, y0: number, w: number, h: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]);
    return out;
  };
  it('drops components far smaller than the largest, keeps comparable ones', () => {
    const cells = [...block(5, 5, 20, 20), ...block(0, 0, 2, 2), [28, 28] as [number, number]];
    expect(maskCount(removeSpecks(mk(cells), 0.05))).toBe(400);
    expect(maskCount(removeSpecks(mk([...block(2, 2, 20, 20), ...block(26, 0, 4, 8)]), 0.05))).toBe(
      432,
    );
  });
  it('keeps a part that still fills a bead and drops a sub-bead speck', () => {
    const big = mk([...block(2, 2, 24, 24), ...block(27, 5, 3, 3)], 40, 40);
    big.data[39 * 40 + 39] = 1;
    expect(maskCount(removeSpecks(big, 0.05, 0))).toBe(576);
    expect(maskCount(removeSpecks(big, 0.05, 64))).toBe(576 + 9);
  });
  it('treats diagonal neighbours as connected', () => {
    const cells: [number, number][] = [];
    for (let i = 0; i < 20; i++) cells.push([i, i]);
    expect(maskCount(removeSpecks(mk(cells), 0.5))).toBe(20);
  });
  it('leaves an empty mask empty', () => {
    expect(maskCount(removeSpecks(createMask(5, 5), 0.1))).toBe(0);
  });
});
