import { keyedMask } from './keying';
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
): (p: number) => boolean {
  const { data } = img;
  const px: [number, number, number] = [0, 0, 0];
  const memo = new Map<number, boolean>();
  return (p) => {
    const key = (data[p * 4]! << 16) | (data[p * 4 + 1]! << 8) | data[p * 4 + 2]!;
    let v = memo.get(key);
    if (v === undefined) {
      px[0] = data[p * 4]!;
      px[1] = data[p * 4 + 1]!;
      px[2] = data[p * 4 + 2]!;
      memo.set(key, (v = distance(px, seed) <= tolerance));
    }
    return v;
  };
}

/** A background colour found on the image border. */
export interface BorderSeed {
  readonly rgb: RgbTuple;
  /** Share (0..1) of the border pixels in this colour cluster. */
  readonly share: number;
  /** Median ΔE of the cluster's pixels to {@link BorderSeed.rgb}: the background's own noise. */
  readonly noise: number;
}

/** A seed with its flood limits (see {@link floodKeyMask}). */
export interface KeySeed {
  readonly rgb: RgbTuple;
  /** Largest ΔE between a pixel and the pixel the flood reaches it from; `Infinity` = no limit. */
  readonly step: number;
  /** Largest ΔE between a pixel and the seed colour. */
  readonly cap: number;
  /**
   * ΔE to the seed colour within which pixels at most `FRINGE_PX` (2) pixels from the keyed
   * region are keyed too (soft anti-aliased edges); absent or ≤ `cap` = none.
   */
  readonly fringe?: number;
}

/** ΔE within which a border colour bin joins an existing seed cluster. */
const CLUSTER_RADIUS = 8;

/** Smallest border share for a colour cluster to become a seed. */
export const SEED_MIN_SHARE = 0.1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Seeds of the border key: every cluster of border colours (quantised bins merged within
 * {@link CLUSTER_RADIUS} ΔE of any bin already in the cluster, so a gradient is one cluster) covering at least `minShare` of the border, largest
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
  const clusters: { members: RgbTuple[]; pixels: number[] }[] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.length - a.length)) {
    const rgb = rgbOf(bin);
    const home = clusters.find((c) => c.members.some((m) => distance(rgb, m) <= CLUSTER_RADIUS));
    if (home) {
      home.pixels.push(...bin);
      home.members.push(rgb);
    } else clusters.push({ members: [rgb], pixels: [...bin] });
  }
  const seeds = clusters
    .sort((a, b) => b.pixels.length - a.pixels.length)
    .map((c): BorderSeed => {
      const rgb = rgbOf(c.pixels);
      const memo = new Map<number, number>();
      const px: [number, number, number] = [0, 0, 0];
      const ds = c.pixels.map((p) => {
        const key = (data[p * 4]! << 16) | (data[p * 4 + 1]! << 8) | data[p * 4 + 2]!;
        let d = memo.get(key);
        if (d === undefined) {
          px[0] = data[p * 4]!;
          px[1] = data[p * 4 + 1]!;
          px[2] = data[p * 4 + 2]!;
          memo.set(key, (d = distance(px, rgb)));
        }
        return d;
      });
      ds.sort((a, b) => a - b);
      return {
        rgb,
        share: c.pixels.length / border.length,
        noise: ds[Math.floor(0.5 * (ds.length - 1))] ?? 0,
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
  if (!seed) {
    const all = createMask(img.width, img.height);
    all.data.fill(1);
    return all;
  }
  return keyedMask(img, distance, [{ rgb: seed, step: Infinity, cap: tolerance }]);
}
