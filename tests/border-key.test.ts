import { describe, expect, it } from 'vitest';
import {
  adaptiveKey,
  borderSeeds,
  createMask,
  floodKeyMask,
  keysConnected,
  maskCount,
  removeSpecks,
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

describe('floodKeyMask', () => {
  it('follows a gentle gradient that a flat tolerance cannot', () => {
    const img = image(60, 40, (x, y) => {
      const g = 255 - x * 2;
      return inBox(x, y, 25, 35) ? [20, 20, 20] : [g, g, g];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 4, cap: 40, anchor: 0 };
    const flat = { ...seed, step: Infinity, cap: 4 };
    expect(maskCount(floodKeyMask(img, dist, [seed]))).toBe(100);
    expect(maskCount(floodKeyMask(img, dist, [flat]))).toBeGreaterThan(100);
  });
  it('does not creep past the cap into a region reached by small steps', () => {
    const img = image(60, 30, (x) => {
      const g = x < 30 ? 255 : 255 - (x - 30) * 3;
      return [g, g, g];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 4, cap: 12, anchor: 0 };
    const fg = floodKeyMask(img, dist, [seed]);
    expect(fg.data[15 * 60 + 5]).toBe(0);
    expect(fg.data[15 * 60 + 55]).toBe(1);
  });
  it('unions the floods of several seeds', () => {
    const img = image(40, 40, (x, y) =>
      inBox(x, y, 15, 25) ? [10, 10, 10] : y < 20 ? [90, 150, 225] : [250, 250, 250],
    );
    const seeds = withKey(borderSeeds(img, dist), 3, 6);
    expect(seeds).toHaveLength(2);
    expect(maskCount(floodKeyMask(img, dist, seeds))).toBe(100);
  });
  it('keeps enclosed background-coloured regions', () => {
    const img = image(21, 21, (x, y) => {
      const r = Math.max(Math.abs(x - 10), Math.abs(y - 10));
      return r === 6 ? [0, 0, 0] : [255, 255, 255];
    });
    const seed = { rgb: [255, 255, 255] as Rgb, step: 3, cap: 6, anchor: 0 };
    expect(maskCount(floodKeyMask(img, dist, [seed]))).toBe(169);
  });
});

describe('fringe', () => {
  it('keys a soft anti-aliased edge up to two pixels beyond the flood', () => {
    const img = image(40, 20, (x) =>
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
    const seed = { rgb: [255, 255, 255] as Rgb, step: 3, cap: 3, anchor: 0 };
    expect(maskCount(floodKeyMask(img, dist, [seed]))).toBe(400);
    expect(maskCount(floodKeyMask(img, dist, [{ ...seed, fringe: 20 }]))).toBe(360);
  });
});

describe('keysConnected', () => {
  const img = image(40, 40, (_, y) => (y < 20 ? [90, 150, 225] : [250, 250, 250]));
  const seeds = withKey(borderSeeds(img, dist), 3, 6);
  it('joins seeds across a soft horizon but not across a sharp edge', () => {
    const soft = image(40, 60, (_, y) => {
      const t = Math.min(1, Math.max(0, (y - 20) / 20));
      return [90 + 160 * t, 150 + 100 * t, 225 + 25 * t];
    });
    const s = withKey(borderSeeds(soft, dist), 8, 40);
    expect(s.length).toBeGreaterThan(1);
    expect(keysConnected(soft, dist, floodKeyMask(soft, dist, s), s)).toBe(true);
    expect(keysConnected(img, dist, floodKeyMask(img, dist, seeds), seeds)).toBe(false);
  });
  it('does not join seeds split by foreground', () => {
    const wall = image(40, 40, (x) =>
      x < 18 ? [90, 150, 225] : x < 22 ? [200, 0, 0] : [250, 250, 250],
    );
    const two = withKey(borderSeeds(wall, dist), 3, 6);
    expect(two).toHaveLength(2);
    expect(keysConnected(wall, dist, floodKeyMask(wall, dist, two), two)).toBe(false);
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
  it('treats diagonal neighbours as connected', () => {
    const cells: [number, number][] = [];
    for (let i = 0; i < 20; i++) cells.push([i, i]);
    expect(maskCount(removeSpecks(mk(cells), 0.5))).toBe(20);
  });
  it('leaves an empty mask empty', () => {
    expect(maskCount(removeSpecks(createMask(5, 5), 0.1))).toBe(0);
  });
});
