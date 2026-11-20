import type { Lab } from '../palette/types';
import { deltaE2000 } from '../palette/deltaE';
import { clusterColours } from './cluster';
import { matchEntry } from './match';
import type { NearestFn } from './prepare';

/** Share of the foreground below which a detail colour is no longer kept as its own colour. */
const DETAIL_MIN = 0.001;

const FLAT_DIST2 = 28 * 28;
const BLEND_OFF2 = 40 * 40;

/**
 * Pixels that are not an anti-aliased edge: a pixel is an edge pixel when, along a row or column,
 * both neighbours differ clearly (RGB distance ≥ 28) from it and from each other and its colour
 * lies on the line between theirs (within 40), i.e. it is a blend of them. A line of a third
 * colour, or of the neighbours' own colour, stays flat. Edge pixels would otherwise become
 * clusters of their own.
 */
function flatPixels(data: Uint8ClampedArray, labels: Int16Array, width: number): Uint8Array {
  const n = labels.length;
  const flat = new Uint8Array(n);
  const rgb = (p: number): number[] => [data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!];
  const sub = (u: number[], v: number[]): number[] => u.map((x, i) => x - v[i]!);
  const dot = (u: number[], v: number[]): number => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const blend = (p: number, a: number, b: number): boolean => {
    if (a < 0 || b >= n || labels[a]! < 0 || labels[b]! < 0) return false;
    const [c, u, v] = [rgb(p), rgb(a), rgb(b)];
    const ab = sub(v, u);
    const len2 = dot(ab, ab);
    if (len2 < FLAT_DIST2 || dot(sub(c, u), sub(c, u)) < FLAT_DIST2) return false;
    const t = dot(sub(c, u), ab) / len2;
    if (t <= 0 || t >= 1 || dot(sub(c, v), sub(c, v)) < FLAT_DIST2) return false;
    const off = sub(
      sub(c, u),
      ab.map((x) => x * t),
    );
    return dot(off, off) <= BLEND_OFF2;
  };
  for (let p = 0; p < n; p++) {
    if (labels[p]! < 0) continue;
    const x = p % width;
    const row = x > 0 && x < width - 1 && blend(p, p - 1, p + 1);
    flat[p] = row || blend(p, p - width, p + width) ? 0 : 1;
  }
  return flat;
}

/** How well one colour cluster of the image is matched by its palette entry. */
export interface ColourMatch {
  /** Palette index the cluster maps to. */
  readonly index: number;
  /** ΔE2000 between the cluster's centroid and that entry. */
  readonly deltaE: number;
  /** Share of the clustered foreground pixels, 0..1. */
  readonly share: number;
}

/** Result of {@link reduceColours}. */
export interface Reduction {
  /** Final palette index of an image colour. */
  readonly at: (r: number, g: number, b: number) => number;
  /** Final palette index of a palette entry's own colour (unmixed edge pixels). */
  readonly ofEntry: (index: number) => number;
  /** One match per cluster, in cluster order. */
  readonly matches: readonly ColourMatch[];
}

/** Input of {@link reduceColours}. */
export interface ReduceInput {
  /** RGBA data of the (denoised) image. */
  readonly data: Uint8ClampedArray;
  /** Nearest palette index per pixel, `-1` outside the foreground. */
  readonly labels: Int16Array;
  /** Image width in pixels. */
  readonly width: number;
  /** Pixels whose label comes from edge unmixing; they do not take part in clustering. */
  readonly blend: Uint8Array;
  readonly detail: readonly boolean[];
  readonly labs: readonly Lab[];
  readonly nearest: NearestFn;
  readonly maxColors: number;
  /** Palette index that is always kept and counts towards `maxColors` (panel background). */
  readonly pinned?: number;
}

/**
 * Palette reduction (SPEC R59.3): the foreground colours are clustered in Lab down to
 * `maxColors` (Ward merging, see {@link clusterColours}), then each cluster gets its nearest
 * palette entry (ΔE2000, hue-preserving: see {@link matchEntry}); clusters landing on one entry merge. Only flat pixels (not on an
 * anti-aliased edge) form clusters; the others join the nearest cluster. Pixels nearest to a detail
 * colour of at least 0.1 % keep it and take a slot. The pinned entry takes the cluster nearest
 * to it. Deterministic.
 */
export function reduceColours(o: ReduceInput): Reduction {
  const { data, labels, blend, detail, labs, nearest } = o;
  const hist = new Array<number>(labs.length).fill(0);
  let total = 0;
  for (const k of labels)
    if (k >= 0) {
      hist[k]!++;
      total++;
    }
  const fixed = hist.map((n, i) => !!detail[i] && n > 0 && n >= DETAIL_MIN * total);
  const fixedCount = fixed.filter(Boolean).length;
  const pin = o.pinned !== undefined && o.pinned >= 0 && !fixed[o.pinned] ? o.pinned : -1;
  const flat = flatPixels(data, labels, o.width);
  const include = new Uint8Array(labels.length);
  let flats = 0;
  for (let p = 0; p < labels.length; p++)
    if (labels[p]! >= 0 && !blend[p] && !fixed[labels[p]!] && flat[p]) {
      include[p] = 1;
      flats++;
    }
  if (flats === 0)
    for (let p = 0; p < labels.length; p++)
      if (labels[p]! >= 0 && !blend[p] && !fixed[labels[p]!]) include[p] = 1;
  const cl = clusterColours(data, include, {
    k: Math.max(1, Math.max(1, o.maxColors) - fixedCount),
    ...(pin >= 0 ? { pin: labs[pin]! } : {}),
  });
  const clustered = cl.clusters.reduce((a, c) => a + c.count, 0);
  const matches: ColourMatch[] = [];
  const entryOf = cl.clusters.map((c) => {
    const m = c.pinned
      ? { index: pin, deltaE: deltaE2000(c.lab, labs[pin]!) }
      : matchEntry(c.lab, labs);
    if (c.count > 0) matches.push({ ...m, share: c.count / clustered });
    return m.index;
  });
  const lookup = (i: number, via: () => number): number =>
    fixed[i] || entryOf.length === 0 ? i : entryOf[via()]!;
  return {
    at: (r, g, b) => {
      const n = nearest(r, g, b);
      return lookup(n, () => cl.assign(r, g, b));
    },
    ofEntry: (i) => lookup(i, () => cl.assignLab(labs[i]!)),
    matches,
  };
}
