import type { KeySeed } from './borderKey';
import { createMask } from './mask';
import type { ColorDistance, Mask, RgbTuple, RgbaImage } from './types';

/** Width in pixels of the anti-aliasing fringe a seed may key beyond its flood. */
export const FRINGE_PX = 2;

/** Smallest ΔE between neighbouring keyed pixels that {@link planKeying} still crosses. */
const CONNECT_STEP = 6;

/** Seam half-width of a horizon bridge, as a share of the short image side (at least 6 px). */
const BRIDGE_SHARE = 0.05;

/** Bridge colours lie strictly between the two seed colours on their line. */
const BRIDGE_T_MIN = 0.05;
const BRIDGE_T_MAX = 0.95;

const COLOURS = 1 << 24;

const keyOf = (d: Uint8ClampedArray, i: number): number =>
  (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;

let sharedLut: Uint8Array | null = null;

/**
 * Per-colour cached `distance(colour, rgb) <= tol` over the 24-bit colour space. Reuses one table:
 * a test is valid until the next one is made.
 */
function nearTest(
  img: RgbaImage,
  distance: ColorDistance,
  rgb: RgbTuple,
  tol: number,
): (p: number) => boolean {
  const lut = (sharedLut ??= new Uint8Array(COLOURS));
  lut.fill(0);
  const { data } = img;
  const px: [number, number, number] = [0, 0, 0];
  return (p) => {
    const i = p * 4;
    const key = keyOf(data, i);
    let v = lut[key]!;
    if (!v) {
      px[0] = data[i]!;
      px[1] = data[i + 1]!;
      px[2] = data[i + 2]!;
      lut[key] = v = distance(px, rgb) <= tol ? 1 : 2;
    }
    return v === 1;
  };
}

/**
 * Largest RGB distance per ΔE unit around `rgb`, probing ±6 levels along each channel and along
 * the grey axis: the scale that turns a ΔE step limit into a cheap RGB comparison.
 */
function rgbPerDeltaE(distance: ColorDistance, rgb: RgbTuple): number {
  let best = 0;
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ] as const)
    for (const off of [-6, 6]) {
      const probe: [number, number, number] = [0, 1, 2].map((c) =>
        Math.min(255, Math.max(0, rgb[c]! + off * axis[c]!)),
      ) as [number, number, number];
      const e = Math.hypot(probe[0] - rgb[0], probe[1] - rgb[1], probe[2] - rgb[2]);
      const d = e ? distance(rgb, probe) : 0;
      if (d > 0) best = Math.max(best, e / d);
    }
  return best || 1;
}

/**
 * Pixels (1) keyed by one seed: reachable (4-connected) from the border through pixels within
 * `cap` of the seed colour, each within `step` (ΔE, compared in RGB at the seed's local scale) of
 * the pixel it is reached from; then grown by {@link FRINGE_PX} pixels into pixels within
 * `fringe` of the seed colour.
 */
export function floodSeed(img: RgbaImage, distance: ColorDistance, seed: KeySeed): Uint8Array {
  const { width: w, height: h, data } = img;
  const bg = new Uint8Array(w * h);
  if (w === 0 || h === 0) return bg;
  const near = nearTest(img, distance, seed.rgb, seed.cap);
  const lim = seed.step < Infinity ? (seed.step * rgbPerDeltaE(distance, seed.rgb)) ** 2 : Infinity;
  const rejected = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p: number, from: number): void => {
    if (bg[p]) return;
    let ok = near(p);
    if (ok && from >= 0 && lim < Infinity) {
      const i = p * 4;
      const j = from * 4;
      const dr = data[i]! - data[j]!;
      const dg = data[i + 1]! - data[j + 1]!;
      const db = data[i + 2]! - data[j + 2]!;
      ok = dr * dr + dg * dg + db * db <= lim;
    }
    if (ok) {
      bg[p] = 1;
      stack[sp++] = p;
    } else if (from >= 0) rejected[p] = 1;
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
  if (seed.fringe && seed.fringe > seed.cap) growFringe(img, distance, seed, bg, rejected);
  return bg;
}

function growFringe(
  img: RgbaImage,
  distance: ColorDistance,
  seed: KeySeed,
  bg: Uint8Array,
  rejected: Uint8Array,
): void {
  const { width: w, height: h } = img;
  const near = nearTest(img, distance, seed.rgb, seed.fringe!);
  let frontier: number[] = [];
  for (let p = 0; p < w * h; p++) if (rejected[p] && !bg[p]) frontier.push(p);
  for (let round = 0; round < FRINGE_PX; round++) {
    const next: number[] = [];
    for (const p of frontier) {
      if (bg[p] || !near(p)) continue;
      bg[p] = 1;
      const x = p % w;
      if (x > 0 && !bg[p - 1]) next.push(p - 1);
      if (x < w - 1 && !bg[p + 1]) next.push(p + 1);
      if (p >= w && !bg[p - w]) next.push(p - w);
      if (p < w * (h - 1) && !bg[p + w]) next.push(p + w);
    }
    frontier = next;
  }
}

/** Copy of `set` grown by `rounds` 4-connected pixels. */
function dilate(set: Uint8Array, w: number, h: number, rounds: number): Uint8Array {
  const out = set.slice();
  let frontier: number[] = [];
  for (let p = 0; p < set.length; p++) if (set[p]) frontier.push(p);
  for (let r = 0; r < rounds; r++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w])
        if (q >= 0 && q < w * h && !out[q]) {
          out[q] = 1;
          next.push(q);
        }
    }
    frontier = next;
  }
  return out;
}

/**
 * Pixels (1) in the seam between two seeds' floods that blend their colours: within the
 * seam half-width of both floods and, per {@link BRIDGE_T_MIN}..{@link BRIDGE_T_MAX}, on the
 * line between the seed colours within `min(cap)/2` (a blurred horizon).
 */
function bridgePixels(
  img: RgbaImage,
  distance: ColorDistance,
  seeds: readonly KeySeed[],
  floods: readonly Uint8Array[],
): Uint8Array {
  const { width: w, height: h, data } = img;
  const bridge = new Uint8Array(w * h);
  const rounds = Math.max(6, Math.round(BRIDGE_SHARE * Math.min(w, h)));
  const reach = floods.map((f) => dilate(f, w, h, rounds));
  const px: [number, number, number] = [0, 0, 0];
  const mix: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < seeds.length; i++)
    for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i]!.rgb;
      const b = seeds[j]!.rgb;
      const tol = Math.min(seeds[i]!.cap, seeds[j]!.cap);
      const len = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2;
      if (len === 0) continue;
      const memo = new Map<number, boolean>();
      for (let p = 0; p < w * h; p++) {
        if (bridge[p] || floods[i]![p] || floods[j]![p] || !reach[i]![p] || !reach[j]![p]) continue;
        const k = keyOf(data, p * 4);
        let on = memo.get(k);
        if (on === undefined) {
          px[0] = data[p * 4]!;
          px[1] = data[p * 4 + 1]!;
          px[2] = data[p * 4 + 2]!;
          const t =
            ((px[0] - a[0]) * (b[0] - a[0]) +
              (px[1] - a[1]) * (b[1] - a[1]) +
              (px[2] - a[2]) * (b[2] - a[2])) /
            len;
          for (let c = 0; c < 3; c++) mix[c] = a[c]! + t * (b[c]! - a[c]!);
          on = t > BRIDGE_T_MIN && t < BRIDGE_T_MAX && distance(px, mix) <= tol;
          memo.set(k, on);
        }
        if (on) bridge[p] = 1;
      }
    }
  return bridge;
}

/** Border pixel closest in colour to the seed: a pixel its flood is known to key. */
function anchorOf(img: RgbaImage, distance: ColorDistance, seed: KeySeed): number {
  const { width: w, height: h, data } = img;
  const px: [number, number, number] = [0, 0, 0];
  let best = 0;
  let bestD = Infinity;
  const visit = (p: number): void => {
    px[0] = data[p * 4]!;
    px[1] = data[p * 4 + 1]!;
    px[2] = data[p * 4 + 2]!;
    const d = distance(px, seed.rgb);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  return best;
}

/** Result of {@link planKeying}. */
export interface KeyPlan<S extends KeySeed = KeySeed> {
  /** Seeds whose keyed regions join the largest seed's (in order, largest first). */
  readonly used: readonly S[];
  /** Keyed background (1) of the planned image: floods of the used seeds plus bridges. */
  readonly background: Uint8Array;
  /** Horizon-bridge pixels (1) of the planned image; all-zero for one seed. */
  readonly bridge: Uint8Array;
}

/**
 * Plans the border key on `img` (typically a downsample): floods every seed, adds horizon bridges
 * between seeds, and keeps the seeds whose keyed regions join the first seed's through
 * neighbouring pixels differing by at most max(6, 2·step) (a soft horizon joins; two fields
 * meeting at a sharp edge, as in a flag, do not, and a motif touching the border in a colour of
 * its own is not mistaken for background).
 */
export function planKeying<S extends KeySeed>(
  img: RgbaImage,
  distance: ColorDistance,
  seeds: readonly S[],
): KeyPlan<S> {
  const { width: w, height: h, data } = img;
  const floods = seeds.map((s) => floodSeed(img, distance, s));
  const bridge =
    seeds.length > 1 ? bridgePixels(img, distance, seeds, floods) : new Uint8Array(w * h);
  const background = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) background[p] = bridge[p]! || floods.some((f) => f[p]) ? 1 : 0;
  if (seeds.length < 2) return { used: seeds, background, bridge };

  const finite = seeds.map((s) => s.step).filter(Number.isFinite);
  const scale = Math.max(...seeds.map((s) => rgbPerDeltaE(distance, s.rgb)));
  const lim = (Math.max(CONNECT_STEP, 2 * Math.max(0, ...finite)) * scale) ** 2;
  const reached = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p: number, from: number): void => {
    if (reached[p] || !background[p]) return;
    if (from >= 0) {
      const i = p * 4;
      const j = from * 4;
      const dr = data[i]! - data[j]!;
      const dg = data[i + 1]! - data[j + 1]!;
      const db = data[i + 2]! - data[j + 2]!;
      if (dr * dr + dg * dg + db * db > lim) return;
    }
    reached[p] = 1;
    stack[sp++] = p;
  };
  push(anchorOf(img, distance, seeds[0]!), -1);
  while (sp > 0) {
    const p = stack[--sp]!;
    const x = p % w;
    if (x > 0) push(p - 1, p);
    if (x < w - 1) push(p + 1, p);
    if (p >= w) push(p - w, p);
    if (p < w * (h - 1)) push(p + w, p);
  }
  const used = seeds.filter((s, i) => i === 0 || reached[anchorOf(img, distance, s)]);
  return used.length === seeds.length
    ? { used, background, bridge }
    : planKeying(img, distance, used);
}

/**
 * Foreground (1) of `img` given a plan from {@link planKeying} on the same or a downsampled
 * picture: not in any used seed's flood, nor in the (nearest-neighbour scaled) bridge.
 */
export function keyedMask(
  img: RgbaImage,
  distance: ColorDistance,
  used: readonly KeySeed[],
  bridge?: { readonly width: number; readonly height: number; readonly data: Uint8Array },
): Mask {
  const { width: w, height: h } = img;
  const fg = createMask(w, h);
  fg.data.fill(1);
  for (const s of used) {
    const f = floodSeed(img, distance, s);
    for (let p = 0; p < f.length; p++) if (f[p]) fg.data[p] = 0;
  }
  if (bridge)
    for (let y = 0; y < h; y++) {
      const by = Math.min(bridge.height - 1, Math.floor((y * bridge.height) / h));
      for (let x = 0; x < w; x++)
        if (
          bridge.data[
            by * bridge.width + Math.min(bridge.width - 1, Math.floor((x * bridge.width) / w))
          ]
        )
          fg.data[y * w + x] = 0;
    }
  return fg;
}
