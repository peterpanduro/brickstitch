import { describe, expect, it } from 'vitest';
import {
  alphaMask,
  borderKeyMask,
  borderShare,
  dominantBorderColour,
  flipImage,
  rotateImage,
  boundingBox,
  createMask,
  cropImage,
  cropMask,
  edt,
  hasTransparency,
  invert,
  maskCount,
  median3,
  resampleBox,
  resampleNearest,
  shrinkToSide,
  thickenSkeleton,
  thresholdMask,
  union,
  zhangSuen,
  type Mask,
  type RgbaImage,
} from '../src/core/imaging';

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maskFrom(rows: string[]): Mask {
  const m = createMask(rows[0]!.length, rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m.data[y * m.width + x] = c === '#' ? 1 : 0)));
  return m;
}

function fill(m: Mask, f: (x: number, y: number) => boolean): Mask {
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) m.data[y * m.width + x] = f(x, y) ? 1 : 0;
  return m;
}

function image(
  w: number,
  h: number,
  f: (x: number, y: number) => [number, number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

const get = (m: Mask, x: number, y: number): number =>
  x < 0 || y < 0 || x >= m.width || y >= m.height ? 0 : m.data[y * m.width + x]!;

function components8(m: Mask): number {
  const seen = new Uint8Array(m.data.length);
  let n = 0;
  for (let i = 0; i < m.data.length; i++) {
    if (!m.data[i] || seen[i]) continue;
    n++;
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const p = st.pop()!;
      const px = p % m.width;
      const py = Math.floor(p / m.width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (get(m, px + dx, py + dy) && !seen[(py + dy) * m.width + px + dx]) {
            seen[(py + dy) * m.width + px + dx] = 1;
            st.push((py + dy) * m.width + px + dx);
          }
        }
    }
  }
  return n;
}

const euclid = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('mask helpers', () => {
  it('counts, inverts, unions', () => {
    const a = maskFrom(['#.', '..']);
    const b = maskFrom(['.#', '..']);
    expect(maskCount(a)).toBe(1);
    expect(maskCount(invert(a))).toBe(3);
    expect(Array.from(union(a, b).data)).toEqual([1, 1, 0, 0]);
    expect(() => union(a, createMask(3, 3))).toThrow();
  });
});

describe('resample', () => {
  const img = image(4, 2, (x) => (x < 2 ? [0, 0, 0, 255] : [200, 100, 50, 255]));
  it('box averages area', () => {
    const out = resampleBox(img, 1, 1);
    expect(Array.from(out.data)).toEqual([100, 50, 25, 255]);
  });
  it('box keeps colour of partly transparent pixels (premultiplied)', () => {
    const t = image(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 255, 0, 0]));
    expect(Array.from(resampleBox(t, 1, 1).data)).toEqual([255, 0, 0, 128]);
  });
  it('nearest picks source pixels', () => {
    const out = resampleNearest(img, 2, 1);
    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([200, 100, 50, 255]);
  });
});

describe('median3', () => {
  it('removes salt noise but keeps edges', () => {
    const img = image(7, 7, (x, y) => (x === 3 && y === 3 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    expect(median3(img).data.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0))).toBe(true);
    const edge = image(6, 6, (x) => (x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(Array.from(median3(edge).data)).toEqual(Array.from(edge.data));
  });
});

describe('foreground masks', () => {
  const img = image(2, 1, (x) => (x === 0 ? [10, 10, 10, 255] : [240, 240, 240, 100]));
  it('alpha mask and transparency detection', () => {
    expect(Array.from(alphaMask(img).data)).toEqual([1, 0]);
    expect(hasTransparency(img)).toBe(true);
    expect(hasTransparency(image(1, 1, () => [0, 0, 0, 255]))).toBe(false);
  });
  it('threshold: dark is foreground, invert flips', () => {
    expect(Array.from(thresholdMask(img).data)).toEqual([1, 0]);
    expect(Array.from(thresholdMask(img, 128, true).data)).toEqual([0, 1]);
  });
});

describe('borderKeyMask', () => {
  const W: [number, number, number, number] = [255, 255, 255, 255];
  const K: [number, number, number, number] = [0, 0, 0, 255];
  it('keeps an enclosed white region inside a dark outline', () => {
    const img = image(11, 11, (x, y) => {
      const ring = Math.max(Math.abs(x - 5), Math.abs(y - 5));
      return ring === 3 ? K : W;
    });
    const fg = borderKeyMask(img, euclid, 10);
    expect(fg.data[0]).toBe(0);
    expect(fg.data[5 * 11 + 5]).toBe(1);
    expect(fg.data[5 * 11 + 2]).toBe(1);
    expect(maskCount(fg)).toBe(49);
  });
  it('calls distance once per distinct pixel colour', () => {
    const img = image(20, 20, (x, y) => ((x + y) % 3 === 0 ? K : W));
    let calls = 0;
    const counting = (a: readonly number[], b: readonly number[]): number => (
      calls++,
      euclid(a, b)
    );
    borderKeyMask(img, counting, 10);
    expect(calls).toBe(2);
  });
  it('tolerance admits near-background shades', () => {
    const img = image(5, 5, (x) => (x === 0 ? [250, 250, 250, 255] : W));
    expect(maskCount(borderKeyMask(img, euclid, 0))).toBe(5);
    expect(maskCount(borderKeyMask(img, euclid, 20))).toBe(0);
  });
});

describe('rotateImage / flipImage', () => {
  const px = (img: RgbaImage): number[][] => {
    const out: number[][] = [];
    for (let y = 0; y < img.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < img.width; x++) row.push(img.data[(y * img.width + x) * 4]!);
      out.push(row);
    }
    return out;
  };
  const src = image(3, 2, (x, y) => [y * 3 + x, 0, 0, 255]);
  it('rotates clockwise by quarter turns, swapping dimensions at 90/270', () => {
    expect(px(rotateImage(src, 0))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    const r1 = rotateImage(src, 1);
    expect([r1.width, r1.height]).toEqual([2, 3]);
    expect(px(r1)).toEqual([
      [3, 0],
      [4, 1],
      [5, 2],
    ]);
    expect(px(rotateImage(src, 2))).toEqual([
      [5, 4, 3],
      [2, 1, 0],
    ]);
    expect(px(rotateImage(src, 3))).toEqual([
      [2, 5],
      [1, 4],
      [0, 3],
    ]);
    expect(rotateImage(src, 1).data[3]).toBe(255);
  });
  it('flips horizontally and vertically without touching the source', () => {
    expect(px(flipImage(src, 'h'))).toEqual([
      [2, 1, 0],
      [5, 4, 3],
    ]);
    expect(px(flipImage(src, 'v'))).toEqual([
      [3, 4, 5],
      [0, 1, 2],
    ]);
    expect(px(src)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });
});

describe('dominant border colour', () => {
  const R: [number, number, number, number] = [215, 38, 43, 255];
  const B: [number, number, number, number] = [0, 53, 173, 255];
  it('is the majority colour, not the per-channel median of a mixed border', () => {
    const img = image(10, 10, (x) => (x < 3 ? R : B));
    expect(dominantBorderColour(img)).toEqual([0, 53, 173]);
    expect(borderShare(img, [0, 53, 173], euclid, 10)).toBeCloseTo(22 / 36);
  });
  it('is null for an empty image', () => {
    expect(dominantBorderColour({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(
      null,
    );
  });
});

describe('bounding box and crop', () => {
  it('finds, crops and handles empty', () => {
    const m = maskFrom(['....', '.##.', '.#..', '....']);
    const box = boundingBox(m);
    expect(box).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(cropMask(m, box!).data)).toEqual([1, 1, 1, 0]);
    const img = image(4, 4, (x, y) => [x, y, 0, 255]);
    expect(Array.from(cropImage(img, box!).data.slice(0, 4))).toEqual([1, 1, 0, 255]);
    expect(boundingBox(createMask(3, 3))).toBeNull();
  });
});

describe('zhangSuen', () => {
  it('thins a 3-px wide line to a connected 1-px line', () => {
    const m = fill(createMask(40, 9), (x, y) => x >= 2 && x < 38 && y >= 3 && y <= 5);
    const s = zhangSuen(m);
    expect(components8(s)).toBe(1);
    for (let x = 6; x < 34; x++) {
      let col = 0;
      for (let y = 0; y < 9; y++) col += get(s, x, y);
      expect(col).toBe(1);
    }
    for (let i = 0; i < s.data.length; i++) if (s.data[i]) expect(m.data[i]).toBe(1);
  });
  it('thins a filled rectangle to a line', () => {
    const m = fill(createMask(30, 14), (x, y) => x >= 2 && x < 28 && y >= 2 && y < 12);
    const s = zhangSuen(m);
    expect(components8(s)).toBe(1);
    expect(maskCount(s)).toBeGreaterThan(5);
    expect(maskCount(s)).toBeLessThan(40);
  });
  it('does not mutate input and keeps a single pixel', () => {
    const m = maskFrom(['...', '.#.', '...']);
    expect(Array.from(zhangSuen(m).data)).toEqual(Array.from(m.data));
  });
  it('keeps a 1-px diagonal intact', () => {
    const m = fill(createMask(12, 12), (x, y) => x === y);
    expect(maskCount(zhangSuen(m))).toBeGreaterThanOrEqual(10);
  });
});

describe('edt', () => {
  function brute(m: Mask): Float64Array {
    const out = new Float64Array(m.data.length).fill(Infinity);
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++)
        for (let j = 0; j < m.height; j++)
          for (let i = 0; i < m.width; i++)
            if (m.data[j * m.width + i])
              out[y * m.width + x] = Math.min(out[y * m.width + x]!, (x - i) ** 2 + (y - j) ** 2);
    return out;
  }
  it('matches brute force on random masks', () => {
    const rnd = prng(42);
    for (const [w, h, p] of [
      [17, 13, 0.05],
      [9, 31, 0.3],
      [24, 24, 0.01],
      [1, 8, 0.5],
      [8, 1, 0.5],
    ] as const) {
      const m = fill(createMask(w, h), () => rnd() < p);
      if (maskCount(m) === 0) m.data[0] = 1;
      expect(Array.from(edt(m))).toEqual(Array.from(brute(m)));
    }
  });
  it('is Infinity for an empty mask and 0 on set pixels', () => {
    expect(edt(createMask(3, 3)).every((v) => v === Infinity)).toBe(true);
    expect(edt(maskFrom(['#..']))[2]).toBe(4);
    expect(edt(maskFrom(['#..']))[0]).toBe(0);
  });
});

describe('thickenSkeleton', () => {
  it('widens a 1-px diagonal to at least 3 px everywhere', () => {
    const n = 40;
    const m = fill(createMask(n, n), (x, y) => x === y);
    const t = thickenSkeleton(m, 4);
    for (let i = 5; i < n - 5; i++) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [2, 0],
        [0, 2],
        [-2, 0],
        [0, -2],
      ] as const)
        expect(get(t, i + dx, i + dy)).toBe(1);
    }
    for (let i = 0; i < m.data.length; i++) if (m.data[i]) expect(t.data[i]).toBe(1);
  });
  it('keeps a large disc area within 5 %', () => {
    const m = fill(createMask(80, 80), (x, y) => (x - 40) ** 2 + (y - 40) ** 2 <= 30 ** 2);
    const t = thickenSkeleton(m, 4);
    expect(Math.abs(maskCount(t) - maskCount(m)) / maskCount(m)).toBeLessThan(0.05);
  });
  it('returns the mask unchanged when empty', () => {
    expect(maskCount(thickenSkeleton(createMask(5, 5), 4))).toBe(0);
  });
});

describe.skipIf(!import.meta.env['VITE_PERF'])('perf 2048x2048 (VITE_PERF=1)', () => {
  it('times zhangSuen and edt', () => {
    const n = 2048;
    const rnd = prng(7);
    const blobs = Array.from(
      { length: 40 },
      () => [rnd() * n, rnd() * n, 40 + rnd() * 160] as const,
    );
    const m = fill(createMask(n, n), (x, y) =>
      blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r),
    );
    let t0 = performance.now();
    const s = zhangSuen(m);
    const zs = performance.now() - t0;
    t0 = performance.now();
    edt(s);
    const ed = performance.now() - t0;
    console.log(`PERF zhangSuen=${zs.toFixed(0)}ms edt=${ed.toFixed(0)}ms`);
    expect(zs).toBeGreaterThan(0);
  });
});

describe('shrinkToSide', () => {
  it('averages k×k blocks with the smallest integer factor that fits', () => {
    const img = image(8, 4, (x) => (x < 4 ? [0, 0, 0, 255] : [200, 100, 50, 255]));
    const out = shrinkToSide(img, 4);
    expect([out.width, out.height]).toEqual([4, 2]);
    expect(Array.from(out.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(out.data.slice(12, 16))).toEqual([200, 100, 50, 255]);
  });
  it('returns the image itself when it already fits', () => {
    const img = image(4, 4, () => [1, 2, 3, 255]);
    expect(shrinkToSide(img, 4)).toBe(img);
  });
});
