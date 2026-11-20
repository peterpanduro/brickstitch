import { alphaMask, thresholdMask } from '../imaging/foreground';
import { adaptiveKey, borderSeeds, type BorderSeed, type KeySeed } from '../imaging/borderKey';
import { keyedMask, planKeying } from '../imaging/keying';
import { edt } from '../imaging/edt';
import { removeSpecks } from '../imaging/specks';
import { createMask, invert, maskCount } from '../imaging/mask';
import { flipImage, rotateImage, type QuarterTurns } from '../imaging/orient';
import { resampleBox, shrinkToSide } from '../imaging/resample';
import type { Box, Mask, RgbaImage } from '../imaging/types';
import { rgbToLab } from '../palette/color';
import { deltaE2000, nearestIndex } from '../palette/deltaE';
import type { Lab, RgbTuple } from '../palette/types';
import type { AnalysisSettings, BackgroundMode } from './settings';

/** Longest working side (SPEC §5.2). */
export const MAX_WORKING_SIDE = 2048;

/** Alpha at or above which a pixel is foreground in alpha mode. */
const ALPHA_FG = 128;

/** Box-downscales so the long side is at most `max`; returns `img` unchanged otherwise. */
export function guardSize(img: RgbaImage, max = MAX_WORKING_SIDE): RgbaImage {
  const long = Math.max(img.width, img.height);
  if (long <= max) return img;
  const k = max / long;
  return resampleBox(
    img,
    Math.max(1, Math.round(img.width * k)),
    Math.max(1, Math.round(img.height * k)),
  );
}

/** `img` mirrored (`flipH`) and then rotated clockwise per the settings (R31). */
export function orientImage(
  img: RgbaImage,
  s: Pick<AnalysisSettings, 'rotation' | 'flipH'>,
): RgbaImage {
  const flipped = s.flipH ? flipImage(img, 'h') : img;
  return rotateImage(flipped, (s.rotation / 90) as QuarterTurns);
}

/** Resolved background mode (never `auto`). */
export type ResolvedBackground = Exclude<BackgroundMode, 'auto'>;

const deltaRgb = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
  deltaE2000(rgbToLab(a), rgbToLab(b));

/** Share of pixels with α < 128 from which `auto` picks alpha mode. */
export const AUTO_ALPHA_SHARE = 0.005;

/** True when at least {@link AUTO_ALPHA_SHARE} of the pixels have α < 128. */
export function prefersAlpha(img: RgbaImage): boolean {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < ALPHA_FG) n++;
  return n > 0 && n >= AUTO_ALPHA_SHARE * img.width * img.height;
}

/** Minimum share of border pixels in seed colour clusters for `auto` to key the border. */
export const AUTO_BORDER_SHARE = 0.8;

/** Foreground components smaller than this share of the largest one are removed after keying. */
export const SPECK_RATIO = 0.01;

/** Longest side of the picture the border key is planned on (R59.1). */
export const KEY_PLAN_SIDE = 512;

/** `auto` keeps borderKey only when the foreground's largest inscribed circle is this wide (radius, share of the short side). */
export const MIN_INRADIUS = 0.008;

/** Largest cap of a single border colour that counts as a quiet background the key is trusted on. */
export const QUIET_CAP = 3;

/** Flood limits per seed: derived from the background's noise (`auto`) or a flat manual cap. */
function keySeeds(
  img: RgbaImage,
  tolerance: AnalysisSettings['borderKeyTolerance'],
): (BorderSeed & KeySeed)[] {
  return borderSeeds(img, deltaRgb).map((s) =>
    tolerance === 'auto'
      ? { ...s, ...adaptiveKey(s.noise) }
      : { ...s, step: Infinity, cap: tolerance },
  );
}

/** Whether a keyed foreground is a plausible motif: empty, or not just slivers. */
function plausible(fg: Mask): boolean {
  if (maskCount(fg) === 0) return true;
  const d = edt(invert(fg));
  let inner = 0;
  for (let p = 0; p < d.length; p++) if (fg.data[p] && d[p]! > inner) inner = d[p]!;
  return Math.sqrt(inner) >= MIN_INRADIUS * Math.min(fg.width, fg.height);
}

/**
 * Foreground mask per `settings.background` (R20, R30, R59.1): `auto` = alpha when >= 0.5 % of
 * pixels have α < 128; else borderKey when >= {@link AUTO_BORDER_SHARE} of the border lies in
 * border colour seed clusters that join through the keyed background and the result is a
 * plausible motif ({@link plausible}, not asked of a single quiet background colour, whose
 * thin line drawings are legitimate); else none (full-bleed image). borderKey is planned on a
 * picture of at most {@link KEY_PLAN_SIDE} px, seeds from every substantial border colour
 * cluster, and drops foreground specks smaller than both {@link SPECK_RATIO} of the largest part
 * and one bead (`beads` = lattice size in beads, 0 = ignore).
 */
export function foregroundMask(
  img: RgbaImage,
  s: AnalysisSettings,
  beads = 0,
): { mask: Mask; mode: ResolvedBackground } {
  const wholeImage = (mode: 'none' | 'borderKey') => {
    const mask = createMask(img.width, img.height);
    mask.data.fill(1);
    return { mask, mode };
  };
  if (s.background === 'alpha' || (s.background === 'auto' && prefersAlpha(img)))
    return { mask: alphaMask(img, ALPHA_FG), mode: 'alpha' };
  if (s.background === 'threshold')
    return { mask: thresholdMask(img, s.threshold, s.thresholdInvert), mode: 'threshold' };
  if (s.background === 'none') return wholeImage('none');
  const auto = s.background === 'auto';
  const seeds = keySeeds(img, s.borderKeyTolerance);
  if (seeds.length === 0) return wholeImage(auto ? 'none' : 'borderKey');
  const small = shrinkToSide(img, KEY_PLAN_SIDE);
  const plan = planKeying(small, deltaRgb, seeds);
  const planned = removeSpecks(
    { width: small.width, height: small.height, data: plan.background.map((v) => v ^ 1) },
    SPECK_RATIO,
    beads,
  );
  const covered = plan.used.reduce((n, k) => n + k.share, 0);
  const quiet = plan.used.length === 1 && plan.used[0]!.cap <= QUIET_CAP;
  if (auto && (covered < AUTO_BORDER_SHARE || (!quiet && !plausible(planned))))
    return wholeImage('none');
  const mask =
    small === img
      ? planned
      : removeSpecks(
          keyedMask(img, deltaRgb, plan.used, { ...small, data: plan.bridge }),
          SPECK_RATIO,
          beads,
        );
  return { mask, mode: 'borderKey' };
}

/** Nearest palette index for an RGB pixel, cached per distinct 24-bit colour. */
export type NearestFn = (r: number, g: number, b: number) => number;

/** Builds a cached nearest-colour lookup over precomputed palette Labs. */
export function makeNearest(labs: readonly Lab[]): NearestFn {
  const cache = new Map<number, number>();
  let lastKey = -1;
  let lastVal = -1;
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    if (key === lastKey) return lastVal;
    let v = cache.get(key);
    if (v === undefined) {
      v = nearestIndex(rgbToLab([r, g, b]), labs);
      cache.set(key, v);
    }
    lastKey = key;
    lastVal = v;
    return v;
  };
}

/** Background estimate from opaque non-foreground pixels. */
export interface BackgroundSample {
  /** Most common nearest palette index (ties: lower), `-1` when there are none. */
  readonly index: number;
  /** Per-channel median colour, `null` when there are none. */
  readonly rgb: RgbTuple | null;
}

const median = (xs: number[]): number => xs.sort((a, b) => a - b)[xs.length >> 1] ?? 0;

/** Samples opaque background pixels on a grid of at most ~65k pixels. */
export function sampleBackground(img: RgbaImage, mask: Mask, nearest: NearestFn): BackgroundSample {
  const step = Math.max(1, Math.ceil(Math.sqrt((img.width * img.height) / 65536)));
  const hist = new Map<number, number>();
  const ch: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const p = y * img.width + x;
      if (mask.data[p] || img.data[p * 4 + 3]! < ALPHA_FG) continue;
      const k = nearest(img.data[p * 4]!, img.data[p * 4 + 1]!, img.data[p * 4 + 2]!);
      hist.set(k, (hist.get(k) ?? 0) + 1);
      for (let c = 0; c < 3; c++) ch[c]!.push(img.data[p * 4 + c]!);
    }
  const index = [...hist].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? -1;
  return { index, rgb: ch[0].length ? [median(ch[0]), median(ch[1]), median(ch[2])] : null };
}

/** Crops `box` grown by `pad` on each side; outside the source is transparent / background. */
export function cropPadded(
  img: RgbaImage,
  mask: Mask,
  box: Box,
  pad: number,
): { img: RgbaImage; mask: Mask } {
  const w = box.width + 2 * pad;
  const h = box.height + 2 * pad;
  const data = new Uint8ClampedArray(w * h * 4);
  const m = createMask(w, h);
  const x0 = box.x - pad;
  const y0 = box.y - pad;
  for (let y = Math.max(0, -y0); y < h && y0 + y < img.height; y++) {
    const xs = Math.max(0, -x0);
    const xe = Math.min(w, img.width - x0);
    if (xe <= xs) continue;
    const src = (y0 + y) * img.width + x0;
    data.set(img.data.subarray((src + xs) * 4, (src + xe) * 4), (y * w + xs) * 4);
    m.data.set(mask.data.subarray(src + xs, src + xe), y * w + xs);
  }
  return { img: { width: w, height: h, data }, mask: m };
}
