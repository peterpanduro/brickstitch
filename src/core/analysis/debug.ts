import { createMask } from '../imaging/mask';
import { skeletonFromParts, skeletonParts, type SkeletonParts } from '../imaging/thicken';
import type { Mask } from '../imaging/types';
import { cropToBox, labelBox, type LabelImage } from './label';
import type { ResolvedBackground } from './prepare';

/**
 * Affine map from layer pixel-edge coordinates to the oriented (and cropped) input image's px:
 * `x = x0 + lx · sx`, `y = y0 + ly · sy`; pixel `(i, j)` covers `[i, i + 1) × [j, j + 1)`.
 */
export interface DebugTransform {
  readonly x0: number;
  readonly y0: number;
  readonly sx: number;
  readonly sy: number;
}

/** A 0/1 mask layer with its placement on the oriented input image. */
export interface DebugLayer {
  readonly data: Uint8Array;
  readonly w: number;
  readonly h: number;
  readonly transform: DebugTransform;
}

/** Palette indices (−1 = background) with their placement on the oriented input image. */
export interface LabelLayer {
  readonly data: Int16Array;
  readonly w: number;
  readonly h: number;
  readonly transform: DebugTransform;
}

/** Debug layers of one analysis run (R39). */
export interface AnalysisDebug {
  readonly background: ResolvedBackground;
  /** 1 = background (removed); at most {@link MAX_DEBUG_SIDE} px on the long side. */
  readonly backgroundMask: DebugLayer;
  /** 1 = pixel added or recoloured by line thickening (working resolution). */
  readonly added: DebugLayer;
  /** 1 = pixel the Details slider (R42) kept from the unfiltered image or added by its thickening. */
  readonly details: DebugLayer;
  /** 1 = silhouette skeleton pixel of a stroke thinner than `minLineWidthPx`. */
  readonly thin: DebugLayer;
  readonly minLineWidthPx: number;
  /** Palette index per working-resolution pixel after thickening (the rasterised image), −1 = background. */
  readonly labels: LabelLayer;
  /** Hex colour of each palette index in {@link labels}. */
  readonly palette: readonly string[];
}

/** Longest side of every debug layer. */
export const MAX_DEBUG_SIDE = 1024;

/** Background layer (1 = not in `mask`), nearest-downsampled by an integer stride; `g` = px per mask px. */
export function backgroundLayer(mask: Mask, gx: number, gy: number): DebugLayer {
  const s = stride(mask.width, mask.height);
  const w = Math.ceil(mask.width / s);
  const h = Math.ceil(mask.height / s);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = mask.data[y * s * mask.width + x * s] ? 0 : 1;
  return { data, w, h, transform: { x0: 0, y0: 0, sx: s * gx, sy: s * gy } };
}

/** Integer stride that brings `w × h` to at most {@link MAX_DEBUG_SIDE} px on the long side. */
const stride = (w: number, h: number): number =>
  Math.max(1, Math.ceil(Math.max(w, h) / MAX_DEBUG_SIDE));

/** `data` (w × h) OR-downsampled by an integer stride to at most {@link MAX_DEBUG_SIDE} px. */
function capLayer(data: Uint8Array, w: number, h: number, t: DebugTransform): DebugLayer {
  const s = stride(w, h);
  if (s === 1) return { data, w, h, transform: t };
  const cw = Math.ceil(w / s);
  const ch = Math.ceil(h / s);
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x]) out[Math.floor(y / s) * cw + Math.floor(x / s)] = 1;
  return { data: out, w: cw, h: ch, transform: { ...t, sx: t.sx * s, sy: t.sy * s } };
}

/** Details layer (R42): union of the given w × h pixel sets, OR-downsampled like `added`. */
export function detailsLayer(
  w: number,
  h: number,
  t: DebugTransform,
  ...sets: (Uint8Array | undefined)[]
): DebugLayer {
  const out = new Uint8Array(w * h);
  for (const s of sets) if (s) for (let p = 0; p < out.length; p++) out[p] = out[p]! | s[p]!;
  return capLayer(out, w, h, t);
}

/** Reuses the skeletons of the last label image read by a `thin` layer (R39); create per dialog. */
export interface ThinCache {
  /** Skeleton computations so far (tests). */
  readonly misses: number;
}

interface ThinCacheState extends ThinCache {
  misses: number;
  labels?: Int16Array;
  w?: number;
  dominant?: number;
  parts: Map<number, SkeletonParts>;
}

/** An empty {@link ThinCache}. */
export const createThinCache = (): ThinCache => ({ misses: 0, parts: new Map() }) as ThinCacheState;

/** The parts cache for `l` (its content, `w` and `dominant`); reset when they differ. */
function partsFor(cache: ThinCacheState, l: LabelImage, dominant: number) {
  const same =
    cache.w === l.w &&
    cache.dominant === dominant &&
    cache.labels?.length === l.labels.length &&
    cache.labels.every((v, i) => v === l.labels[i]);
  if (!same) {
    cache.labels = l.labels;
    cache.w = l.w;
    cache.dominant = dominant;
    cache.parts = new Map();
  }
  return cache.parts;
}

/**
 * `thin` layer: skeleton pixels (R40 `strokeSkeleton`) of the silhouette and of every colour but
 * `dominant` whose local width `2·d − 1` is below `minWidthPx`. Works on the motif box plus one
 * pixel, which gives the same skeletons as the padded image, so a cache hit survives the pad that
 * line sensitivity changes.
 */
function thinPixels(
  l: LabelImage,
  minWidthPx: number,
  dominant: number,
  cache: ThinCacheState,
): Uint8Array {
  const out = new Uint8Array(l.w * l.h);
  const b = labelBox(l);
  if (!b) return out;
  const x0 = Math.max(0, b.x - 1);
  const y0 = Math.max(0, b.y - 1);
  const box = {
    x: x0,
    y: y0,
    width: Math.min(l.w, b.x + b.width + 1) - x0,
    height: Math.min(l.h, b.y + b.height + 1) - y0,
  };
  const sub = cropToBox(l, box);
  const parts = partsFor(cache, sub, dominant);
  const keys = [-1, ...[...new Set(sub.labels)].filter((k) => k >= 0 && k !== dominant)];
  for (const k of keys.sort((a, c) => a - c)) {
    let p = parts.get(k);
    if (!p) {
      const m = createMask(sub.w, sub.h);
      for (let i = 0; i < m.data.length; i++)
        m.data[i] = (k < 0 ? sub.labels[i]! >= 0 : sub.labels[i] === k) ? 1 : 0;
      p = skeletonParts(m);
      parts.set(k, p);
      cache.misses++;
    }
    const skel = skeletonFromParts(p, minWidthPx);
    const d2 = p.bg();
    for (let i = 0; i < d2.length; i++)
      if (skel.data[i] && 2 * Math.sqrt(d2[i]!) - 1 < minWidthPx)
        out[(y0 + Math.floor(i / sub.w)) * l.w + x0 + (i % sub.w)] = 1;
  }
  return out;
}

/**
 * Line layers at working resolution (OR-downsampled to ≤ {@link MAX_DEBUG_SIDE} px): `added` =
 * pixels whose label thickening changed; `thin` = skeleton pixels, of the silhouette and of every
 * colour but `dominant`, whose local width `2·d − 1` (d = distance to background or another
 * colour) is below `minWidthPx` (empty when no thickening runs), so thin coloured lines show in
 * full-bleed images too; `exclude`d pixels (the Details step's) are not `added`. `thin` is computed on first read (only the lines highlight needs it),
 * reusing `cache` when given.
 */
export function lineLayers(
  l: LabelImage,
  thickened: LabelImage,
  minWidthPx: number,
  transform: DebugTransform,
  dominant = -1,
  cache: ThinCache = createThinCache(),
  exclude?: Uint8Array,
): { readonly added: DebugLayer; readonly thin: DebugLayer } {
  const { w, h } = l;
  const active = minWidthPx > 1 && thickened !== l;
  const added = new Uint8Array(w * h);
  if (active)
    for (let p = 0; p < added.length; p++)
      added[p] = thickened.labels[p] !== l.labels[p] && !exclude?.[p] ? 1 : 0;
  let thin: DebugLayer | undefined;
  return {
    added: capLayer(added, w, h, transform),
    get thin() {
      thin ??= capLayer(
        active
          ? thinPixels(l, minWidthPx, dominant, cache as ThinCacheState)
          : new Uint8Array(w * h),
        w,
        h,
        transform,
      );
      return thin;
    },
  };
}

/** True when pixel `(x, y)` is on a 1 px line: both neighbours along an axis share a colour that is not its own. */
function onLine(l: LabelImage, x: number, y: number, k: number): boolean {
  const { w, h, labels } = l;
  const at = (i: number, j: number) =>
    i < 0 || j < 0 || i >= w || j >= h ? NaN : labels[j * w + i]!;
  const a = at(x - 1, y);
  const b = at(x, y - 1);
  return (a === at(x + 1, y) && a !== k) || (b === at(x, y + 1) && b !== k);
}

/**
 * Label layer of `l` (R39), downsampled by an integer stride to at most {@link MAX_DEBUG_SIDE} px:
 * each block takes its most common colour (ties: the first in scan order), background only when it
 * has no colour; pixels on a 1 px line (both neighbours along an axis share another colour, so not
 * an anti-alias fringe between two colours) outvote the rest, so thin lines survive.
 */
export function labelLayer(l: LabelImage, transform: DebugTransform): LabelLayer {
  const { w, h } = l;
  const s = stride(w, h);
  if (s === 1) return { data: Int16Array.from(l.labels), w, h, transform };
  const cw = Math.ceil(w / s);
  const ch = Math.ceil(h / s);
  const out = new Int16Array(cw * ch).fill(-1);
  const LINE = s * s + 1;
  for (let by = 0; by < ch; by++)
    for (let bx = 0; bx < cw; bx++) {
      const votes = new Map<number, number>();
      let best = -1;
      let bestVotes = 0;
      for (let y = by * s; y < Math.min(h, (by + 1) * s); y++)
        for (let x = bx * s; x < Math.min(w, (bx + 1) * s); x++) {
          const k = l.labels[y * w + x]!;
          if (k < 0) continue;
          const v = (votes.get(k) ?? 0) + (onLine(l, x, y, k) ? LINE : 1);
          votes.set(k, v);
          if (v > bestVotes) {
            best = k;
            bestVotes = v;
          }
        }
      out[by * cw + bx] = best;
    }
  return {
    data: out,
    w: cw,
    h: ch,
    transform: { ...transform, sx: transform.sx * s, sy: transform.sy * s },
  };
}
