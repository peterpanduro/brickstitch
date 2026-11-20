import type { RgbaImage } from '../../src/core/imaging';

type Rgb = readonly [number, number, number];

/** Synthetic source image with per-pixel ground-truth region ids. */
export interface QualityImage {
  readonly img: RgbaImage;
  /** Region id per pixel (majority of the 4×4 samples). */
  readonly gt: Int16Array;
  /** Region names, indexed by region id. */
  readonly regions: readonly string[];
  /** Region ids that are motif (the rest is background to remove). */
  readonly fg: readonly number[];
  /** Region id of the surrounding region, per region (`-1`: none). */
  readonly enclosing: readonly number[];
}

/** Seeded generator: uniform in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Deterministic hash of an integer lattice point, in [0, 1). */
export const hash2 = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Linear blend of two colours, `t` clamped to 0..1. */
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

/**
 * Renders `f(x, y) → [colour, region]` with 4×4 supersampling (anti-aliased edges) and optional
 * seeded Gaussian noise of standard deviation `noise` per channel (plus a smaller shared part).
 */
export function render(
  w: number,
  h: number,
  f: (x: number, y: number) => readonly [Rgb, number],
  noise = 0,
  seed = 1,
): { img: RgbaImage; gt: Int16Array } {
  const rnd = rng(seed);
  const gauss = (): number =>
    Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const data = new Uint8ClampedArray(w * h * 4);
  const gt = new Int16Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      const votes = new Map<number, number>();
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
          const [c, r] = f(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
          for (let k = 0; k < 3; k++) acc[k]! += c[k]! / 16;
          votes.set(r, (votes.get(r) ?? 0) + 1);
        }
      const shared = noise ? gauss() * noise * 0.5 : 0;
      for (let k = 0; k < 3; k++)
        data[(y * w + x) * 4 + k] = acc[k]! + (noise ? gauss() * noise + shared : 0);
      data[(y * w + x) * 4 + 3] = 255;
      gt[y * w + x] = [...votes].sort((a, b) => b[1] - a[1])[0]![0];
    }
  return { img: { width: w, height: h, data }, gt };
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [25, 25, 25];

/** Shaded yellow face, black outline, eyes, thin red mouth, pink cheeks on white. */
export function smiley(noise = 0): QualityImage {
  const r = render(
    400,
    400,
    (x, y) => {
      const d = Math.hypot(x - 200, y - 200);
      if (d > 170) return [WHITE, 0];
      if (d > 162) return [BLACK, 2];
      for (const ex of [140, 260])
        if (Math.hypot((x - ex) / 14, (y - 150) / 24) < 1) return [BLACK, 3];
      if (y > 215 && Math.abs(Math.hypot(x - 200, y - 190) - 95) < 4) return [[200, 30, 40], 4];
      for (const ex of [110, 290])
        if (Math.hypot(x - ex, y - 230) < 20) return [[240, 140, 150], 5];
      const t = Math.min(1, Math.hypot(x - 140, y - 130) / 230);
      return [mix([255, 235, 90], [235, 160, 20], t), 1];
    },
    noise,
  );
  return {
    ...r,
    regions: ['bg', 'face', 'outline', 'eyes', 'mouth', 'cheeks'],
    fg: [1, 2, 3, 4, 5],
    enclosing: [-1, 0, 0, 1, 1, 1],
  };
}

/** Magenta shaded petals, yellow centre, thin green stem and leaf on a light-blue gradient. */
export function flower(noise = 0): QualityImage {
  const r = render(
    360,
    480,
    (x, y) => {
      const dx = x - 180;
      const dy = y - 170;
      const rad = Math.hypot(dx, dy);
      if (rad < 38) return [[250, 200, 40], 2];
      const pr = 115 * (0.6 + 0.4 * Math.abs(Math.cos(2.5 * Math.atan2(dy, dx))));
      if (rad < pr) return [mix([245, 150, 190], [190, 60, 120], rad / pr), 1];
      if (dy > 0 && Math.abs(dx - 8 * Math.sin(dy / 50)) < 4) return [[40, 130, 50], 3];
      if (Math.hypot((x - 225) / 45, (y - 360) / 16) < 1) return [[70, 160, 60], 4];
      return [mix([210, 235, 250], [170, 205, 235], y / 480), 0];
    },
    noise,
  );
  return {
    ...r,
    regions: ['bg', 'petals', 'centre', 'stem', 'leaf'],
    fg: [1, 2, 3, 4],
    enclosing: [-1, 0, 1, 0, 0],
  };
}

/** Full-bleed landscape: gradient sky, sun, green hills, house wall, red roof, brown door. */
export function landscape(noise = 0): QualityImage {
  const r = render(
    480,
    360,
    (x, y) => {
      if (x > 330 && x < 400 && y > 175 && y < 235)
        return x > 355 && x < 375 && y > 205 ? [[90, 50, 30], 5] : [[245, 240, 225], 3];
      if (y < 175 && y > 110 + Math.abs(x - 365) * 0.8 && x > 320 && x < 410)
        return [[190, 40, 35], 4];
      const hill = 220 + 30 * Math.sin(x / 70);
      if (y > hill) return [mix([110, 180, 70], [40, 100, 40], (y - hill) / 140), 2];
      if (Math.hypot(x - 90, y - 70) < 32) return [[255, 230, 120], 1];
      return [mix([90, 150, 225], [200, 225, 245], y / 260), 0];
    },
    noise,
  );
  return {
    ...r,
    regions: ['sky', 'sun', 'hills', 'wall', 'roof', 'door'],
    fg: [0, 1, 2, 3, 4, 5],
    enclosing: [-1, 0, 0, 2, 0, 3],
  };
}

const SNOW_TOP = 332;

const isSpeckle = (x: number, y: number): boolean => {
  for (let k = 0; k < 12; k++) {
    const a = k * 2.1 + 0.4;
    const onEdge = k % 3 === 0;
    const cx = onEdge ? 190 + 130 * Math.cos(a) : 140 + hash2(k, 1) * 140;
    const cy = onEdge ? 250 + 85 * Math.sin(a) : 215 + hash2(k, 2) * 90;
    if (Math.hypot(x - cx, y - cy) < 4) return true;
  }
  return false;
};

/**
 * Near-white bird on a 253 background: soft grey shading (247 to 220) on one side, dark speckles
 * (some on the silhouette edge), red comb above a black eye, black beak and tail tip, textured
 * near-white snow strip along the bottom that touches the feet.
 */
export function whiteOnWhite(): QualityImage {
  const r = render(400, 400, (x, y) => {
    const inBody = Math.hypot((x - 190) / 130, (y - 250) / 85) < 1;
    const inHead = Math.hypot(x - 300, y - 150) < 48;
    if (Math.hypot(x - 310, y - 140) < 6) return [BLACK, 4];
    if (Math.hypot((x - 305) / 14, (y - 100) / 9) < 1) return [[205, 40, 45], 3];
    if (x > 345 && x < 385 && Math.abs(y - 152) < (385 - x) / 4) return [BLACK, 5];
    if (inBody && x < 85) return [BLACK, 6];
    if (isSpeckle(x, y)) return [[60, 60, 60], 2];
    if (inBody || inHead)
      return [mix([247, 247, 247], [220, 222, 226], (260 - x) / 200), inBody ? 1 : 8];
    if (y > 300 && (Math.abs(x - 150) < 6 || Math.abs(x - 230) < 6))
      return y < SNOW_TOP ? [[200, 190, 185], 9] : [[245, 245, 245], 7];
    if (y > SNOW_TOP) {
      const n = hash2(Math.floor(x / 3), Math.floor(y / 3));
      return [[238 + n * 14, 238 + n * 14, 240 + n * 12], 7];
    }
    return [[253, 253, 253], 0];
  });
  return {
    ...r,
    regions: ['bg', 'body', 'speckles', 'comb', 'eye', 'beak', 'tail', 'snow', 'head', 'feet'],
    fg: [1, 2, 3, 4, 5, 6, 8, 9],
    enclosing: [-1, 0, 1, 8, 8, 8, 1, 0, 0, 0],
  };
}

/**
 * Blue sky over a blurred horizon over near-white snow, with a white object across the horizon
 * whose shaded side is bluish grey and whose lit side is close to the snow.
 */
export function twoToneBorder(): QualityImage {
  const r = render(400, 400, (x, y) => {
    if (Math.hypot((x - 200) / 100, (y - 230) / 110) < 1)
      return [mix([170, 185, 205], [246, 248, 250], (x - 110) / 120), 2];
    const n = hash2(x >> 2, y >> 2) * 6;
    const snow: Rgb = [248 - n, 250 - n, 252];
    const sky = mix([90, 150, 225], [150, 195, 238], y / 200);
    return [mix(sky, snow, (y - 188) / 24), y < 200 ? 0 : 1];
  });
  return { ...r, regions: ['sky', 'snow', 'object'], fg: [2], enclosing: [-1, -1, 0] };
}
