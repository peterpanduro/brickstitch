import { deltaE2000 } from '../palette/deltaE';
import type { Lab } from '../palette/types';
import { clusterColours, type Clustering } from './cluster';
import { matchEntry } from './match';
import type { NearestFn } from './prepare';

/** Share of the foreground below which a detail colour is no longer kept as its own colour. */
const DETAIL_MIN = 0.001;
const FLAT_DIST2 = 28 * 28;
const BLEND_OFF2 = 40 * 40;
const BLEND_WEIGHT = 0.25;
const REFILL_RANGE = 12;

/**
 * Pixels that are not an anti-aliased edge: a pixel is an edge pixel when, along a row or column,
 * both neighbours differ clearly (RGB distance ≥ 28) from it and from each other and its colour
 * lies on the line between theirs (within 40), i.e. it is a blend of them. A line of a third
 * colour, or of the neighbours' own colour, stays flat. Edge pixels would otherwise become
 * clusters of their own.
 */
export function flatPixels(data: Uint8ClampedArray, labels: Int16Array, width: number): Uint8Array {
  const n = labels.length;
  const flat = new Uint8Array(n);
  const blend = (p: number, a: number, b: number): boolean => {
    const cr = data[p * 4]!;
    const cg = data[p * 4 + 1]!;
    const cb = data[p * 4 + 2]!;
    const ur = data[a * 4]!;
    const ug = data[a * 4 + 1]!;
    const ub = data[a * 4 + 2]!;
    const pr = cr - ur;
    const pg = cg - ug;
    const pb = cb - ub;
    if (pr * pr + pg * pg + pb * pb < FLAT_DIST2) return false;
    const vr = data[b * 4]!;
    const vg = data[b * 4 + 1]!;
    const vb = data[b * 4 + 2]!;
    const qr = cr - vr;
    const qg = cg - vg;
    const qb = cb - vb;
    if (qr * qr + qg * qg + qb * qb < FLAT_DIST2) return false;
    const ar = vr - ur;
    const ag = vg - ug;
    const ab = vb - ub;
    const len2 = ar * ar + ag * ag + ab * ab;
    if (len2 < FLAT_DIST2) return false;
    const t = (pr * ar + pg * ag + pb * ab) / len2;
    if (t <= 0 || t >= 1) return false;
    const or = pr - ar * t;
    const og = pg - ag * t;
    const ob = pb - ab * t;
    return or * or + og * og + ob * ob <= BLEND_OFF2;
  };
  for (let p = 0, x = 0; p < n; p++, x = x + 1 === width ? 0 : x + 1) {
    if (labels[p]! < 0) continue;
    const row =
      x > 0 &&
      x < width - 1 &&
      labels[p - 1]! >= 0 &&
      labels[p + 1]! >= 0 &&
      blend(p, p - 1, p + 1);
    const col =
      !row &&
      p >= width &&
      p + width < n &&
      labels[p - width]! >= 0 &&
      labels[p + width]! >= 0 &&
      blend(p, p - width, p + width);
    flat[p] = row || col ? 0 : 1;
  }
  return flat;
}

/** How well a palette entry matches the colours of the picture that map to it (R59.5). */
export interface ColourMatch {
  /** Palette index. */
  readonly index: number;
  /** ΔE2000 from the entry to the average colour of each cluster mapped to it, weighted by share. */
  readonly deltaE: number;
  /** Share of the clustered foreground pixels (the pinned background excluded), 0..1. */
  readonly share: number;
}

/** Result of {@link reduceColours}. */
export interface Reduction {
  /** Final palette index of an image colour. */
  readonly at: (r: number, g: number, b: number) => number;
  /** Final palette index of a palette entry's own colour (unmixed edge pixels). */
  readonly ofEntry: (index: number) => number;
  /** One match per palette entry that stands in for picture colours, in palette order. */
  readonly matches: readonly ColourMatch[];
  /** Foreground pixels that are neither edge blends nor unmixed (1). */
  readonly flat: Uint8Array;
}

/** Input of {@link reduceColours}. */
export interface ReduceInput {
  /** RGBA data of the (denoised) image. */
  readonly data: Uint8ClampedArray;
  /** Nearest palette index per pixel, `-1` outside the foreground. */
  readonly labels: Int16Array;
  /** Image width in pixels. */
  readonly width: number;
  /** Pixels whose label comes from edge unmixing; they count lightly, at their entry's colour. */
  readonly blend: Uint8Array;
  readonly detail: readonly boolean[];
  readonly labs: readonly Lab[];
  /** RGB per palette entry. */
  readonly rgbs: readonly (readonly [number, number, number])[];
  readonly nearest: NearestFn;
  readonly maxColors: number;
  /** Palette index that is always kept and counts towards `maxColors` (panel background). */
  readonly pinned?: number;
}

/**
 * Palette reduction (SPEC R59.3): the foreground colours are clustered in Lab down to
 * `maxColors` (Ward merging, see {@link clusterColours}), then each cluster gets a palette
 * entry (ΔE2000, hue-preserving: see {@link matchEntry}); clusters landing on one entry merge,
 * and when that frees slots the merges are undone from the last one while the distinct entries
 * (with the detail and pinned ones) stay within `maxColors`. Flat pixels form clusters; unmixed
 * edge pixels count at 0.25 with their fitted entry's colour; other edge pixels join the
 * nearest cluster. Pixels nearest to a detail colour of at least 0.1 % keep it and take a slot
 * (the largest ones when there are too many). The pinned entry takes the cluster nearest to it,
 * which keeps its own centroid. Deterministic.
 */
export function reduceColours(o: ReduceInput): Reduction {
  const { data, labels, blend, detail, labs, nearest } = o;
  const budget = Math.max(1, o.maxColors);
  const hist = new Array<number>(labs.length).fill(0);
  let total = 0;
  for (const k of labels)
    if (k >= 0) {
      hist[k]!++;
      total++;
    }
  const pinOk = o.pinned !== undefined && o.pinned >= 0 && budget > 1;
  const eligible = hist
    .map((_, i) => i)
    .filter((i) => detail[i] && hist[i]! > 0 && hist[i]! >= DETAIL_MIN * total)
    .sort((a, b) => hist[b]! - hist[a]! || a - b)
    .slice(0, Math.max(0, budget - (pinOk ? 1 : 0) - 1));
  const fixed = hist.map((_, i) => eligible.includes(i));
  const pin = pinOk && !fixed[o.pinned!] ? o.pinned! : -1;
  const flat = flatPixels(data, labels, o.width);
  const weight = new Float32Array(labels.length);
  let cdata = data;
  let flats = 0;
  for (let p = 0; p < labels.length; p++) {
    const k = labels[p]!;
    if (k < 0 || fixed[k]) continue;
    if (blend[p]) {
      if (cdata === data) cdata = data.slice();
      cdata.set(o.rgbs[k]!, p * 4);
      weight[p] = BLEND_WEIGHT;
    } else if (flat[p]) {
      weight[p] = 1;
      flats++;
    }
  }
  if (flats === 0)
    for (let p = 0; p < labels.length; p++)
      if (labels[p]! >= 0 && !blend[p] && !fixed[labels[p]!]) weight[p] = 1;
  const target = Math.max(1, budget - eligible.length);
  const cl0 = clusterColours(cdata, weight, {
    k: target,
    ...(pin >= 0 ? { pin: labs[pin]! } : {}),
  });
  const entriesOf = (c: Clustering): { index: number; deltaE: number }[] =>
    c.clusters.map((x) =>
      x.pinned ? { index: pin, deltaE: deltaE2000(x.lab, labs[pin]!) } : matchEntry(x.lab, labs),
    );
  const distinct = (es: { index: number }[]): number =>
    new Set([...es.map((e) => e.index), ...eligible, ...(pin >= 0 ? [pin] : [])]).size;
  let cl = cl0;
  let entries = entriesOf(cl0);
  let best = distinct(entries);
  for (let kk = target + 1; kk <= Math.min(cl0.max, target + REFILL_RANGE); kk++) {
    const c = cl0.cut(kk);
    const es = entriesOf(c);
    const d = distinct(es);
    if (d <= budget && d > best) {
      cl = c;
      entries = es;
      best = d;
    }
  }
  const byEntry = new Map<number, { share: number; weighted: number }>();
  const body = cl.clusters.reduce((a, c) => a + (c.pinned ? 0 : c.count), 0);
  cl.clusters.forEach((c, s) => {
    if (c.pinned || !(c.count > 0)) return;
    const e = byEntry.get(entries[s]!.index) ?? { share: 0, weighted: 0 };
    const sh = c.count / body;
    e.share += sh;
    e.weighted += sh * entries[s]!.deltaE;
    byEntry.set(entries[s]!.index, e);
  });
  const matches: ColourMatch[] = [...byEntry]
    .sort((a, b) => a[0] - b[0])
    .map(([index, e]) => ({ index, deltaE: e.weighted / e.share, share: e.share }));
  const entryOf = entries.map((e) => e.index);
  const lookup = (i: number, via: () => number): number =>
    fixed[i] || entryOf.length === 0 ? i : entryOf[via()]!;
  const ofEntryCache = new Map<number, number>();
  const flatMask = new Uint8Array(labels.length);
  for (let p = 0; p < labels.length; p++)
    flatMask[p] = labels[p]! >= 0 && !blend[p] && flat[p] ? 1 : 0;
  return {
    at: (r, g, b) => lookup(nearest(r, g, b), () => cl.assign(r, g, b)),
    ofEntry: (i) => {
      let v = ofEntryCache.get(i);
      if (v === undefined) ofEntryCache.set(i, (v = lookup(i, () => cl.assignLab(labs[i]!))));
      return v;
    },
    matches,
    flat: flatMask,
  };
}
