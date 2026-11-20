import { createMask } from './mask';
import type { ColorDistance, Mask, RgbTuple, RgbaImage } from './types';

const medianOf = (values: number[]): number =>
  values.sort((a, b) => a - b)[values.length >> 1] ?? 0;

/** Bits dropped per channel when binning border colours. */
const QUANT_SHIFT = 4;

/** Pixel indices of the image border, each once, clockwise from the top-left. */
function borderPixels(w: number, h: number): number[] {
  if (w === 0 || h === 0) return [];
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x);
  for (let y = 1; y < h; y++) out.push(y * w + w - 1);
  if (h > 1) for (let x = w - 2; x >= 0; x--) out.push((h - 1) * w + x);
  if (w > 1) for (let y = h - 2; y > 0; y--) out.push(y * w);
  return out;
}

/**
 * Dominant border colour: the per-channel median of the border pixels in the most common
 * quantised (4 bits per channel) border colour bin; ties go to the bin seen first.
 * `null` for an empty image.
 */
export function dominantBorderColour(img: RgbaImage): RgbTuple | null {
  const { width: w, height: h, data } = img;
  const bins = new Map<number, number[]>();
  let best: number[] = [];
  for (const p of borderPixels(w, h)) {
    const i = p * 4;
    const key =
      ((data[i]! >> QUANT_SHIFT) << 8) |
      ((data[i + 1]! >> QUANT_SHIFT) << 4) |
      (data[i + 2]! >> QUANT_SHIFT);
    let bin = bins.get(key);
    if (!bin) bins.set(key, (bin = []));
    bin.push(i);
    if (bin.length > best.length) best = bin;
  }
  if (best.length === 0) return null;
  const ch = (c: number): number => medianOf(best.map((i) => data[i + c]!));
  return [ch(0), ch(1), ch(2)];
}

/** Share (0..1) of border pixels within `tolerance` of `seed`; 0 for an empty image. */
export function borderShare(
  img: RgbaImage,
  seed: RgbTuple,
  distance: ColorDistance,
  tolerance: number,
): number {
  const border = borderPixels(img.width, img.height);
  const near = memoNear(img, seed, distance, tolerance);
  let n = 0;
  for (const p of border) if (near(p)) n++;
  return border.length ? n / border.length : 0;
}

function memoNear(
  img: RgbaImage,
  seed: RgbTuple,
  distance: ColorDistance,
  tolerance: number,
  blends: readonly RgbTuple[] = [],
): (p: number) => boolean {
  const { data } = img;
  const px: [number, number, number] = [0, 0, 0];
  const mix: [number, number, number] = [0, 0, 0];
  const memo = new Map<number, boolean>();
  const nearBlend = (other: RgbTuple): boolean => {
    let dot = 0;
    let len = 0;
    for (let c = 0; c < 3; c++) {
      dot += (px[c]! - seed[c]!) * (other[c]! - seed[c]!);
      len += (other[c]! - seed[c]!) ** 2;
    }
    const t = len > 0 ? clamp(dot / len, 0, 1) : 0;
    for (let c = 0; c < 3; c++) mix[c] = seed[c]! + t * (other[c]! - seed[c]!);
    return distance(px, mix) <= Math.max(MIN_BLEND_TOLERANCE, tolerance / 2);
  };
  return (p) => {
    const key = (data[p * 4]! << 16) | (data[p * 4 + 1]! << 8) | data[p * 4 + 2]!;
    let v = memo.get(key);
    if (v === undefined) {
      px[0] = data[p * 4]!;
      px[1] = data[p * 4 + 1]!;
      px[2] = data[p * 4 + 2]!;
      v = distance(px, seed) <= tolerance || blends.some(nearBlend);
      memo.set(key, v);
    }
    return v;
  };
}

/** Smallest ΔE to the line between two seed colours that still counts as horizon blur. */
const MIN_BLEND_TOLERANCE = 1.5;

/** A background colour found on the image border. */
export interface BorderSeed {
  readonly rgb: RgbTuple;
  /** Share (0..1) of the border pixels in this colour cluster. */
  readonly share: number;
  /** Median ΔE of the cluster's pixels to {@link BorderSeed.rgb}: the background's own noise. */
  readonly noise: number;
  /** Border pixel index of the cluster pixel closest to the seed colour. */
  readonly anchor: number;
}

/** A seed with its flood limits (see {@link floodKeyMask}). */
export interface KeySeed {
  readonly rgb: RgbTuple;
  /** Largest ΔE between a pixel and the pixel the flood reaches it from; `Infinity` = no limit. */
  readonly step: number;
  /** Largest ΔE between a pixel and the seed colour. */
  readonly cap: number;
  /** Border pixel index known to be keyed by this seed. */
  readonly anchor: number;
  /**
   * ΔE to the seed colour within which pixels at most {@link FRINGE_PX} pixels from the keyed
   * region are keyed too (soft anti-aliased edges); absent or ≤ `cap` = none.
   */
  readonly fringe?: number;
}

/** Width in pixels of the anti-aliasing fringe a seed may key beyond its flood. */
export const FRINGE_PX = 2;

/** ΔE within which a border colour bin joins an existing seed cluster. */
const CLUSTER_RADIUS = 8;

/** Smallest border share for a colour cluster to become a seed. */
export const SEED_MIN_SHARE = 0.1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Seeds of the border key: every cluster of border colours (quantised bins merged within
 * {@link CLUSTER_RADIUS} ΔE of a larger bin) covering at least `minShare` of the border, largest
 * first; the largest cluster alone when none is that big. Empty for an empty image.
 */
export function borderSeeds(
  img: RgbaImage,
  distance: ColorDistance,
  minShare = SEED_MIN_SHARE,
): BorderSeed[] {
  const { width: w, height: h, data } = img;
  const border = borderPixels(w, h);
  if (border.length === 0) return [];
  const bins = new Map<number, number[]>();
  for (const p of border) {
    const i = p * 4;
    const key =
      ((data[i]! >> QUANT_SHIFT) << 8) |
      ((data[i + 1]! >> QUANT_SHIFT) << 4) |
      (data[i + 2]! >> QUANT_SHIFT);
    let bin = bins.get(key);
    if (!bin) bins.set(key, (bin = []));
    bin.push(p);
  }
  const rgbOf = (ps: number[]): RgbTuple => [
    medianOf(ps.map((p) => data[p * 4]!)),
    medianOf(ps.map((p) => data[p * 4 + 1]!)),
    medianOf(ps.map((p) => data[p * 4 + 2]!)),
  ];
  const clusters: { rgb: RgbTuple; pixels: number[] }[] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.length - a.length)) {
    const rgb = rgbOf(bin);
    const home = clusters.find((c) => distance(rgb, c.rgb) <= CLUSTER_RADIUS);
    if (home) home.pixels.push(...bin);
    else clusters.push({ rgb, pixels: [...bin] });
  }
  const seeds = clusters
    .sort((a, b) => b.pixels.length - a.pixels.length)
    .map((c): BorderSeed => {
      const rgb = rgbOf(c.pixels);
      const memo = new Map<number, number>();
      const px: [number, number, number] = [0, 0, 0];
      let anchor = c.pixels[0]!;
      let best = Infinity;
      const ds = c.pixels.map((p) => {
        const key = (data[p * 4]! << 16) | (data[p * 4 + 1]! << 8) | data[p * 4 + 2]!;
        let d = memo.get(key);
        if (d === undefined) {
          px[0] = data[p * 4]!;
          px[1] = data[p * 4 + 1]!;
          px[2] = data[p * 4 + 2]!;
          memo.set(key, (d = distance(px, rgb)));
        }
        if (d < best) {
          best = d;
          anchor = p;
        }
        return d;
      });
      ds.sort((a, b) => a - b);
      return {
        rgb,
        share: c.pixels.length / border.length,
        noise: ds[Math.floor(0.5 * (ds.length - 1))] ?? 0,
        anchor,
      };
    });
  const big = seeds.filter((s) => s.share >= minShare);
  return big.length ? big : seeds.slice(0, 1);
}

/** Step and cap tolerance of {@link floodKeyMask} derived from a seed's background `noise`. */
export function adaptiveKey(noise: number): { step: number; cap: number; fringe: number } {
  const cap = clamp(NOISE_CAP_BASE + NOISE_CAP_GAIN * noise, 1, 30);
  return {
    step: clamp(NOISE_STEP_BASE + NOISE_STEP_GAIN * noise, 0.75, 10),
    cap,
    fringe: Math.max(cap, FRINGE_TOLERANCE),
  };
}

const FRINGE_TOLERANCE = 12;

const NOISE_STEP_BASE = 0.5;
const NOISE_STEP_GAIN = 1.8;
const NOISE_CAP_BASE = 0.5;
const NOISE_CAP_GAIN = 2.9;

/**
 * Foreground = pixels NOT keyed by any seed. A seed keys a pixel reachable (4-connected) from the
 * border through pixels within `cap` of the seed colour, each within `step` of the pixel it is
 * reached from, so gentle gradients key out while the flood cannot creep far from the seed. A
 * colour on the straight line between two seed colours (a blurred horizon) counts as near too.
 * Enclosed regions of background colour stay foreground.
 * @param distance colour distance; called with reused scratch tuples.
 */
export function floodKeyMask(
  img: RgbaImage,
  distance: ColorDistance,
  seeds: readonly KeySeed[],
): Mask {
  const { width: w, height: h, data } = img;
  const fg = createMask(w, h);
  fg.data.fill(1);
  if (w === 0 || h === 0) return fg;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];
  for (const seed of seeds) {
    seen.fill(0);
    const blends = seeds.filter((o) => o !== seed).map((o) => o.rgb);
    const near = memoNear(img, seed.rgb, distance, seed.cap, blends);
    let sp = 0;
    const push = (p: number, from: number): void => {
      if (seen[p] || !near(p)) return;
      if (from >= 0 && seed.step < Infinity) {
        const i = p * 4;
        const j = from * 4;
        if (data[i] !== data[j] || data[i + 1] !== data[j + 1] || data[i + 2] !== data[j + 2]) {
          a[0] = data[i]!;
          a[1] = data[i + 1]!;
          a[2] = data[i + 2]!;
          b[0] = data[j]!;
          b[1] = data[j + 1]!;
          b[2] = data[j + 2]!;
          if (distance(a, b) > seed.step) return;
        }
      }
      seen[p] = 1;
      fg.data[p] = 0;
      stack[sp++] = p;
    };
    for (let x = 0; x < w; x++) {
      push(x, -1);
      push((h - 1) * w + x, -1);
    }
    for (let y = 0; y < h; y++) {
      push(y * w, -1);
      push(y * w + w - 1, -1);
    }
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % w;
      if (x > 0) push(p - 1, p);
      if (x < w - 1) push(p + 1, p);
      if (p >= w) push(p - w, p);
      if (p < w * (h - 1)) push(p + w, p);
    }
    if (seed.fringe && seed.fringe > seed.cap) growFringe(img, distance, seed, seen, fg);
  }
  return fg;
}

function growFringe(
  img: RgbaImage,
  distance: ColorDistance,
  seed: KeySeed,
  seen: Uint8Array,
  fg: Mask,
): void {
  const { width: w, height: h } = img;
  const near = memoNear(img, seed.rgb, distance, seed.fringe!);
  for (let round = 0; round < FRINGE_PX; round++) {
    const add: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (seen[p] || !near(p)) continue;
      const x = p % w;
      if (
        (x > 0 && seen[p - 1]) ||
        (x < w - 1 && seen[p + 1]) ||
        (p >= w && seen[p - w]) ||
        (p < w * (h - 1) && seen[p + w])
      )
        add.push(p);
    }
    for (const p of add) {
      seen[p] = 1;
      fg.data[p] = 0;
    }
  }
}

/** Smallest ΔE between neighbouring keyed pixels that {@link keysConnected} still crosses. */
const CONNECT_STEP = 6;

/**
 * Whether the keyed background (zeros of `fg`) joins the anchors of all `seeds` in one
 * 4-connected region whose neighbouring pixels differ by at most {@link CONNECT_STEP} or twice
 * the seeds' own step (noisy backgrounds): a soft
 * horizon between sky and snow joins, two fields meeting at a sharp edge (a flag) do not.
 */
export function keysConnected(
  img: RgbaImage,
  distance: ColorDistance,
  fg: Mask,
  seeds: readonly KeySeed[],
): boolean {
  if (seeds.length < 2) return true;
  const { width: w, height: h, data: m } = fg;
  const d = img.data;
  if (seeds.some((s) => m[s.anchor])) return false;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];
  const steps = seeds.map((s) => s.step).filter(Number.isFinite);
  const limit = Math.max(CONNECT_STEP, 2 * Math.max(0, ...steps));
  let sp = 0;
  const push = (p: number, from: number): void => {
    if (seen[p] || m[p]) return;
    const i = p * 4;
    const j = from * 4;
    if (from >= 0 && (d[i] !== d[j] || d[i + 1] !== d[j + 1] || d[i + 2] !== d[j + 2])) {
      a[0] = d[i]!;
      a[1] = d[i + 1]!;
      a[2] = d[i + 2]!;
      b[0] = d[j]!;
      b[1] = d[j + 1]!;
      b[2] = d[j + 2]!;
      if (distance(a, b) > limit) return;
    }
    seen[p] = 1;
    stack[sp++] = p;
  };
  push(seeds[0]!.anchor, -1);
  while (sp > 0) {
    const p = stack[--sp]!;
    const x = p % w;
    if (x > 0) push(p - 1, p);
    if (x < w - 1) push(p + 1, p);
    if (p >= w) push(p - w, p);
    if (p < w * (h - 1)) push(p + w, p);
  }
  return seeds.every((s) => seen[s.anchor]);
}

/**
 * Foreground = pixels NOT reachable (4-connected) from the border through
 * pixels within `tolerance` of `seed` (default: {@link dominantBorderColour}). Enclosed regions
 * of background colour therefore stay foreground.
 * @param distance colour distance; called once per distinct pixel colour with a reused scratch
 * tuple.
 */
export function borderKeyMask(
  img: RgbaImage,
  distance: ColorDistance,
  tolerance: number,
  seed: RgbTuple | null = dominantBorderColour(img),
): Mask {
  if (!seed) return floodKeyMask(img, distance, []);
  return floodKeyMask(img, distance, [{ rgb: seed, step: Infinity, cap: tolerance, anchor: 0 }]);
}
