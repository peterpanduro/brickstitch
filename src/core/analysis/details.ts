import { edt } from '../imaging/edt';
import { createMask, invert } from '../imaging/mask';
import type { Mask } from '../imaging/types';
import { deltaE2000 } from '../palette/deltaE';
import type { Lab } from '../palette/types';
import type { LabelImage } from './label';

/**
 * Narrowest outline stroke (px) the outline step seeds from; thinner rims are anti-alias fringes.
 * The Details steps keep strokes down to 1 px (owner rule) and rely on the blend test instead.
 */
export const OUTLINE_MIN_PX = 2;

/**
 * Shortest stretch of silhouette (in multiples of `minWidthPx`) an outline stroke must follow to
 * be grown inward; shorter groups are speckles or tips and stay as they are (R59.2).
 */
export const OUTLINE_MIN_RUN = 4;

/** A colour within this factor of the straight Lab path between two others is a blend of them. */
const BLEND_SLACK = 1.15;

/** Smallest stroke width (px) the Details slider keeps: `(1 − details) · minWidthPx / 2`. */
export const detailsMinWidth = (details: number, minWidthPx: number): number =>
  ((1 - Math.min(1, Math.max(0, details))) * minWidthPx) / 2;

/** Palette context of the interior-colour steps. */
export interface DetailsContext {
  /** Lab of every palette index (blend test). */
  readonly labs: readonly Lab[];
  /** Palette index of the removed background, `-1` when unknown (counts as a neighbour colour). */
  readonly outside: number;
  /** Reuses the last result of each step for equal inputs (the UI keeps one per dialog). */
  readonly cache?: DetailsCache;
}

/** Last input/result of each interior-colour step; see {@link createDetailsCache}. */
export interface DetailsCache {
  /** Steps answered from the cache (tests). */
  readonly hits: number;
}

interface CacheEntry {
  readonly arrays: readonly ArrayLike<number>[];
  readonly key: string;
  readonly result: { l: LabelImage; changed: Uint8Array };
}

interface DetailsCacheState extends DetailsCache {
  hits: number;
  entries: Map<string, CacheEntry>;
}

/** An empty {@link DetailsCache}. */
export const createDetailsCache = (): DetailsCache =>
  ({ hits: 0, entries: new Map() }) as DetailsCacheState;

const sameArray = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** `run()` or the cached result of step `step` for equal `arrays` and `key`. */
function cached(
  cache: DetailsCache | undefined,
  step: string,
  arrays: readonly ArrayLike<number>[],
  key: string,
  run: () => { l: LabelImage; changed: Uint8Array },
): { l: LabelImage; changed: Uint8Array } {
  if (!cache) return run();
  const c = cache as DetailsCacheState;
  const e = c.entries.get(step);
  if (e && e.key === key && e.arrays.every((a, i) => sameArray(a, arrays[i]!))) {
    c.hits++;
    return e.result;
  }
  const result = run();
  c.entries.set(step, { arrays, key, result });
  return result;
}

const maskOf = (labels: Int16Array, w: number, h: number, k: number): Mask => {
  const m = createMask(w, h);
  for (let p = 0; p < labels.length; p++) m.data[p] = labels[p] === k ? 1 : 0;
  return m;
};

/** Colours other than `dominant` present in `labels`, by ascending area (ties: lower index). */
function interiorColours(labels: Int16Array, dominant: number, skip: readonly boolean[]): number[] {
  const area = new Map<number, number>();
  for (const k of labels)
    if (k >= 0 && k !== dominant && !skip[k]) area.set(k, (area.get(k) ?? 0) + 1);
  return [...area].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([k]) => k);
}

/**
 * Blend colours (R8/R17 test): a colour is a blend when on at least half of its boundary pixels
 * (pixels with another label, or the background as `ctx.outside`, in their 3×3 neighbourhood) it
 * lies, within {@link BLEND_SLACK}, on the Lab path between two other colours found within 2 px —
 * the anti-alias fringe between a line and its surroundings. `skip` (the dominant colour) is not
 * tested.
 */
export function blendColours(
  labels: Int16Array,
  w: number,
  h: number,
  ctx: DetailsContext,
  skip = -1,
): Set<number> {
  const n = ctx.labs.length;
  const memo = new Int8Array(n * n * n);
  const between = (a: number, c: number, b: number): boolean => {
    const key = (a * n + c) * n + b;
    if (memo[key] === 0) {
      const [la, lc, lb] = [ctx.labs[a]!, ctx.labs[c]!, ctx.labs[b]!];
      memo[key] =
        deltaE2000(la, lc) + deltaE2000(lc, lb) <= BLEND_SLACK * deltaE2000(la, lb) ? 1 : -1;
    }
    return memo[key] === 1;
  };
  const colour = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return ctx.outside;
    const k = labels[y * w + x]!;
    return k >= 0 ? k : ctx.outside;
  };
  const edges = new Map<number, number>();
  const blended = new Map<number, number>();
  const near: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = labels[y * w + x]!;
      if (k < 0 || k === skip) continue;
      const p = y * w + x;
      if (
        x > 0 &&
        y > 0 &&
        x < w - 1 &&
        y < h - 1 &&
        labels[p - 1] === k &&
        labels[p + 1] === k &&
        labels[p - w] === k &&
        labels[p + w] === k &&
        labels[p - w - 1] === k &&
        labels[p - w + 1] === k &&
        labels[p + w - 1] === k &&
        labels[p + w + 1] === k
      )
        continue;
      edges.set(k, (edges.get(k) ?? 0) + 1);
      near.length = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const c = colour(x + dx, y + dy);
          if (c >= 0 && c !== k && !near.includes(c)) near.push(c);
        }
      let blend = false;
      for (let i = 0; i < near.length && !blend; i++)
        for (let j = i + 1; j < near.length; j++)
          if (between(near[i]!, k, near[j]!)) {
            blend = true;
            break;
          }
      if (blend) blended.set(k, (blended.get(k) ?? 0) + 1);
    }
  const out = new Set<number>();
  for (const [k, e] of edges) if (2 * (blended.get(k) ?? 0) >= e) out.add(k);
  return out;
}

/** Sliding maximum (window `2r + 1`, centred, zero outside) of `n` values at `off + i · step` (van Herk). */
function maxLine(
  src: Float32Array,
  dst: Float32Array,
  off: number,
  step: number,
  n: number,
  r: number,
) {
  const k = 2 * r + 1;
  const m = n + 2 * r;
  const g = new Float32Array(m);
  const hh = new Float32Array(m);
  const at = (j: number) => (j >= r && j < r + n ? src[off + (j - r) * step]! : 0);
  for (let j = 0; j < m; j++) g[j] = j % k === 0 ? at(j) : Math.max(g[j - 1]!, at(j));
  for (let j = m - 1; j >= 0; j--)
    hh[j] = j % k === k - 1 || j === m - 1 ? at(j) : Math.max(hh[j + 1]!, at(j));
  for (let i = 0; i < n; i++) dst[off + i * step] = Math.max(hh[i]!, g[i + 2 * r]!);
}

/** Separable box maximum of `v` over a `(2r + 1)²` window. */
function boxMax(v: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(v.length);
  const out = new Float32Array(v.length);
  for (let y = 0; y < h; y++) maxLine(v, tmp, y * w, 1, w, r);
  for (let x = 0; x < w; x++) maxLine(tmp, out, x, w, h, r);
  return out;
}

/** Largest `d2` over the mask pixels of the `(2r + 1)²` window around pixel `p`. */
function windowMax(d2: Float32Array, m: Mask, w: number, h: number, p: number, r: number): number {
  const x0 = p % w;
  const y0 = (p - x0) / w;
  let best = 0;
  for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++)
    for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const q = y * w + x;
      if (m.data[q] && d2[q]! > best) best = d2[q]!;
    }
  return best;
}

/** True when no 8-neighbour of mask pixel `p` lies farther from the outside (a stroke's centre line). */
function ridge(d2: Float32Array, m: Mask, w: number, h: number, p: number): boolean {
  const x = p % w;
  const y = (p - x) / w;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (m.data[q] && d2[q]! > d2[p]!) return false;
    }
  return true;
}

/**
 * Estimated stroke width of mask `m` per pixel: `2 · max d − 1`, d = distance to the outside, max
 * over a `(2·⌈minWidthPx/2⌉ + 1)²` window of mask pixels; also returns the squared distances.
 */
function strokeWidth(m: Mask, minWidthPx: number): { width: Float32Array; d2: Float32Array } {
  const d2 = edt(invert(m));
  const d = new Float32Array(d2.length);
  for (let p = 0; p < d.length; p++) if (m.data[p]) d[p] = Math.sqrt(d2[p]!);
  const width = boxMax(d, m.width, m.height, Math.ceil(minWidthPx / 2));
  for (let p = 0; p < width.length; p++) width[p] = 2 * width[p]! - 1;
  return { width, d2 };
}

/**
 * Median protection for the Details slider: foreground pixels of `labels` that lie on a stroke of
 * colour `k ≠ dominant` (not a blend colour) in the unfiltered labels `raw` (a part of the colour
 * that a disc of diameter `minWidthPx` does not fit, i.e. not in its opening) whose estimated
 * width is at least {@link detailsMinWidth} take their `raw`
 * label. Returns the restored labels and the changed pixels.
 */
export function restoreThinStrokes(
  l: LabelImage,
  raw: Int16Array,
  dominant: number,
  minWidthPx: number,
  details: number,
  ctx: DetailsContext,
): { l: LabelImage; changed: Uint8Array } {
  return cached(
    ctx.cache,
    'restore',
    [l.labels, raw],
    JSON.stringify([l.w, dominant, minWidthPx, details, ctx.outside, ctx.labs.length]),
    () => restore(l, raw, dominant, minWidthPx, details, ctx),
  );
}

function restore(
  l: LabelImage,
  raw: Int16Array,
  dominant: number,
  minWidthPx: number,
  details: number,
  ctx: DetailsContext,
): { l: LabelImage; changed: Uint8Array } {
  const { w, h } = l;
  const labels = Int16Array.from(l.labels);
  const changed = new Uint8Array(labels.length);
  const r = minWidthPx / 2;
  const min = detailsMinWidth(details, minWidthPx);
  const blends = blendColours(raw, w, h, ctx, dominant);
  for (const k of interiorColours(raw, dominant, [])) {
    if (blends.has(k)) continue;
    const m = maskOf(raw, w, h, k);
    const { width, d2 } = strokeWidth(m, minWidthPx);
    const core = createMask(w, h);
    for (let p = 0; p < d2.length; p++) core.data[p] = d2[p]! > r * r ? 1 : 0;
    const open = edt(core);
    for (let p = 0; p < labels.length; p++) {
      if (!m.data[p] || l.labels[p]! < 0 || open[p]! <= r * r) continue;
      if (width[p]! < min || labels[p] === k) continue;
      labels[p] = k;
      changed[p] = 1;
    }
  }
  return { l: { ...l, labels }, changed };
}

/**
 * Clears the outline seeds `cand` (set in `seeds`) of every group that does not follow the
 * silhouette for at least `minRun` px. Seeds within `link` px of each other (Chebyshev) form a
 * group, so gaps up to `link` px (anti-alias, width-estimate dropouts) do not split an outline.
 * The run of a group is the smaller of its bounding-box diagonal and its number of pixels touching
 * the background (`toBg ≤ 1`): a thin stroke with background on both sides gets its length, not
 * twice it, and scattered spots do not add up to a stretch.
 */
function keepContinuous(
  seeds: Mask,
  cand: readonly number[],
  toBg: Float32Array,
  link: number,
  minRun: number,
) {
  const { width: w, height: h } = seeds;
  const todo = new Set(cand);
  for (const start of cand) {
    if (!todo.delete(start)) continue;
    const group = [start];
    let [x0, x1, y0, y1] = [w, -1, h, -1];
    let touching = 0;
    for (let i = 0; i < group.length; i++) {
      const x = group[i]! % w;
      const y = (group[i]! - x) / w;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      if (toBg[group[i]!]! <= 1) touching++;
      for (let yy = Math.max(0, y - link); yy <= Math.min(h - 1, y + link); yy++)
        for (let xx = Math.max(0, x - link); xx <= Math.min(w - 1, x + link); xx++)
          if (todo.delete(yy * w + xx)) group.push(yy * w + xx);
    }
    if (Math.min(Math.hypot(x1 - x0 + 1, y1 - y0 + 1), touching) < minRun)
      for (const p of group) seeds.data[p] = 0;
  }
}

/**
 * Interior-colour thickening: for each colour but `dominant`, the `detail` colours (already
 * thickened) and blend colours, in ascending area order, grows (inside the foreground of `out`)
 * - outline strokes (with `outline`): from its pixels next to the background (groups following at
 *   least {@link OUTLINE_MIN_RUN}·`minWidthPx` of silhouette; isolated spots are left) whose estimated
 *   stroke width is in [{@link OUTLINE_MIN_PX}, `minWidthPx`), `minWidthPx` inward (e.g. a thin
 *   black contour around a white figure);
 * - Details strokes (R42, `details > 0`): centre-line pixels (no neighbour farther from the
 *   outside) of strokes whose estimated width is in [{@link detailsMinWidth}, `minWidthPx`),
 *   grown by `minWidthPx / 2`.
 * Pixels of a smaller colour (claimed or original) or of a detail colour are kept, so small
 * details win. Returns the new labels and the pixels changed by the Details strokes.
 */
export function thickenDetails(
  l: LabelImage,
  out: LabelImage,
  minWidthPx: number,
  details: number,
  dominant: number,
  detail: readonly boolean[],
  ctx: DetailsContext,
  outline = false,
): { l: LabelImage; changed: Uint8Array } {
  return cached(
    ctx.cache,
    'thicken',
    [l.labels, out.labels, out.cover],
    JSON.stringify([l.w, minWidthPx, details, dominant, detail, outline, ctx.outside]),
    () => thicken(l, out, minWidthPx, details, dominant, detail, ctx, outline),
  );
}

function thicken(
  l: LabelImage,
  out: LabelImage,
  minWidthPx: number,
  details: number,
  dominant: number,
  detail: readonly boolean[],
  ctx: DetailsContext,
  outline: boolean,
): { l: LabelImage; changed: Uint8Array } {
  const { w, h } = l;
  const labels = Int16Array.from(out.labels);
  const cover = Float32Array.from(out.cover);
  const changed = new Uint8Array(labels.length);
  const claimed = new Uint8Array(labels.length);
  const min = detailsMinWidth(details, minWidthPx);
  const r2 = (minWidthPx / 2) ** 2;
  const toBg = outline ? edt(maskOf(l.labels, w, h, -1)) : null;
  const blends = blendColours(l.labels, w, h, ctx, dominant);
  const done = new Set<number>();
  const grow = (k: number, sel: Mask, reach2: number, mark: boolean): void => {
    const near = edt(sel);
    for (let p = 0; p < labels.length; p++) {
      const was = labels[p]!;
      if (near[p]! > reach2 || was < 0 || claimed[p] || detail[was] || (was !== k && done.has(was)))
        continue;
      claimed[p] = 1;
      if (was === k) continue;
      labels[p] = k;
      cover[p] = 1;
      if (mark) changed[p] = 1;
    }
  };
  for (const k of interiorColours(l.labels, dominant, detail)) {
    done.add(k);
    if (blends.has(k)) continue;
    const m = maskOf(l.labels, w, h, k);
    if (toBg) {
      const edge: number[] = [];
      for (let p = 0; p < labels.length; p++) if (m.data[p] && toBg[p]! <= 2) edge.push(p);
      const seeds = edge.length ? createMask(w, h) : null;
      if (seeds) {
        const d2 = edt(invert(m));
        const r = Math.ceil(minWidthPx / 2);
        const cand: number[] = [];
        for (const p of edge) {
          const width = 2 * Math.sqrt(windowMax(d2, m, w, h, p, r)) - 1;
          if (width >= OUTLINE_MIN_PX && width < minWidthPx) {
            seeds.data[p] = 1;
            cand.push(p);
          }
        }
        keepContinuous(seeds, cand, toBg!, Math.ceil(minWidthPx), minWidthPx * OUTLINE_MIN_RUN);
        if (seeds.data.includes(1)) grow(k, seeds, minWidthPx ** 2, false);
      }
    }
    if (details <= 0) continue;
    const { width, d2 } = strokeWidth(m, minWidthPx);
    const inner = createMask(w, h);
    let any = false;
    for (let p = 0; p < d2.length; p++) {
      if (!m.data[p] || width[p]! < min || width[p]! >= minWidthPx) continue;
      if (!ridge(d2, m, w, h, p)) continue;
      inner.data[p] = 1;
      any = true;
    }
    if (any) grow(k, inner, r2, true);
  }
  return { l: { labels, cover, w, h }, changed };
}
