import { rgbToLab } from '../palette/color';
import type { Lab } from '../palette/types';

/** One colour cluster: true (weighted) Lab centroid of its pixels. */
export interface ColourCluster {
  readonly lab: Lab;
  readonly count: number;
  /** The cluster that must map to the pinned colour (panel background). */
  readonly pinned: boolean;
}

/** A clustering at some number of clusters, see {@link clusterColours}. */
export interface Clustering {
  readonly clusters: readonly ColourCluster[];
  /** Cluster of an RGB colour: its histogram cell's cluster, or the nearest centroid for an empty cell. */
  readonly assign: (r: number, g: number, b: number) => number;
  /** Cluster whose centroid is nearest to a Lab colour. */
  readonly assignLab: (lab: Lab) => number;
  /** Number of clusters before any merge (the largest `k` that {@link Clustering.cut} honours). */
  readonly max: number;
  /** The clustering with `k` clusters (merges undone from the last one; `k` is clamped). */
  readonly cut: (k: number) => Clustering;
}

/** Options of {@link clusterColours}. */
export interface ClusterOptions {
  /** Clusters to keep (at least 1). */
  readonly k: number;
  /** Colour of a cluster that is never merged away: the pinned colour of the pattern. */
  readonly pin?: Lab;
}

const BITS = 5;
const MAX_BINS = 1000;
const PIN_RADIUS2 = 20 * 20;

const dist2 = (a: Lab, b: Lab): number => (a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

interface Bins {
  readonly shift: number;
  readonly bits: number;
  readonly binOf: Int32Array;
  readonly n: number[];
  readonly lab: Lab[];
}

/** Histogram of the weighted pixels in 5-bit RGB cells, coarsened until at most {@link MAX_BINS} cells are occupied. */
function histogram(data: Uint8ClampedArray, weight: ArrayLike<number>): Bins {
  const size = 1 << (3 * BITS);
  let cnt = new Float64Array(size);
  let sr = new Float64Array(size);
  let sg = new Float64Array(size);
  let sb = new Float64Array(size);
  const shift = 8 - BITS;
  for (let p = 0; p < weight.length; p++) {
    const w = weight[p]!;
    if (!(w > 0)) continue;
    const r = data[p * 4]!;
    const g = data[p * 4 + 1]!;
    const b = data[p * 4 + 2]!;
    const i = ((r >> shift) << (2 * BITS)) | ((g >> shift) << BITS) | (b >> shift);
    cnt[i]! += w;
    sr[i]! += w * r;
    sg[i]! += w * g;
    sb[i]! += w * b;
  }
  let bits = BITS;
  const occupied = (c: Float64Array): number => c.reduce((a, x) => a + (x > 0 ? 1 : 0), 0);
  while (bits > 1 && occupied(cnt) > MAX_BINS) {
    const nb = bits - 1;
    const next = 1 << (3 * nb);
    const c2 = new Float64Array(next);
    const r2 = new Float64Array(next);
    const g2 = new Float64Array(next);
    const b2 = new Float64Array(next);
    const mask = (1 << bits) - 1;
    for (let i = 0; i < cnt.length; i++) {
      if (!(cnt[i]! > 0)) continue;
      const r = (i >> (2 * bits)) & mask;
      const g = (i >> bits) & mask;
      const b = i & mask;
      const j = ((r >> 1) << (2 * nb)) | ((g >> 1) << nb) | (b >> 1);
      c2[j]! += cnt[i]!;
      r2[j]! += sr[i]!;
      g2[j]! += sg[i]!;
      b2[j]! += sb[i]!;
    }
    [cnt, sr, sg, sb] = [c2, r2, g2, b2];
    bits = nb;
  }
  const binOf = new Int32Array(cnt.length).fill(-1);
  const n: number[] = [];
  const lab: Lab[] = [];
  for (let i = 0; i < cnt.length; i++) {
    if (!(cnt[i]! > 0)) continue;
    binOf[i] = n.length;
    n.push(cnt[i]!);
    lab.push(rgbToLab([sr[i]! / cnt[i]!, sg[i]! / cnt[i]!, sb[i]! / cnt[i]!]));
  }
  return { shift: 8 - bits, bits, binOf, n, lab };
}

/**
 * Clusters the colours of the pixels with positive `weight` (RGBA `data`): the colours go into
 * a histogram of RGB cells (coarsened to at most 1000 occupied cells), and cells merge by
 * Ward's rule until `k` clusters remain, so shades of one colour merge before a small distinct
 * colour is lost. The cost is `√(nₐ·n_b/(nₐ+n_b))·ΔE76²` between centroids: the square root of
 * Ward's count weight keeps a large smooth gradient from outweighing two small colours that
 * are far apart (pink cheeks against a red mouth). With `pin`, the largest cell within ΔE 20 of
 * it is pinned: it absorbs, is never absorbed and keeps its own centroid. Without such a cell an
 * empty pinned cluster is reserved. The merge order is recorded, so {@link Clustering.cut}
 * gives the clustering at any other `k`. Deterministic.
 */
export function clusterColours(
  data: Uint8ClampedArray,
  weight: ArrayLike<number>,
  { k, pin }: ClusterOptions,
): Clustering {
  const h = histogram(data, weight);
  const m = h.n.length;
  let pinBin = -1;
  if (pin)
    h.lab.forEach((c, i) => {
      if (dist2(c, pin) <= PIN_RADIUS2 && (pinBin < 0 || h.n[i]! > h.n[pinBin]!)) pinBin = i;
    });
  const synthetic = !!pin && pinBin < 0;
  const extra = synthetic ? 1 : 0;

  const sum = h.lab.map((c, i) => [h.n[i]! * c.L, h.n[i]! * c.a, h.n[i]! * c.b]);
  const cnt = [...h.n];
  const hasPin = h.n.map((_, i) => i === pinBin);
  const cen = (i: number): Lab =>
    hasPin[i]
      ? h.lab[pinBin]!
      : { L: sum[i]![0]! / cnt[i]!, a: sum[i]![1]! / cnt[i]!, b: sum[i]![2]! / cnt[i]! };
  const alive = h.n.map(() => true);
  const cost = (a: number, b: number): number =>
    Math.sqrt((cnt[a]! * cnt[b]!) / (cnt[a]! + cnt[b]!)) * dist2(cen(a), cen(b));
  const nn = new Int32Array(m).fill(-1);
  const nnCost = new Float64Array(m).fill(Infinity);
  const rescan = (a: number): void => {
    nn[a] = -1;
    nnCost[a] = Infinity;
    for (let b = 0; b < m; b++) {
      if (b === a || !alive[b]) continue;
      const c = cost(a, b);
      if (c < nnCost[a]!) {
        nnCost[a] = c;
        nn[a] = b;
      }
    }
  };
  for (let a = 0; a < m; a++) rescan(a);
  const keeps: number[] = [];
  const drops: number[] = [];
  for (let left = m; left > 1; left--) {
    let i = -1;
    for (let a = 0; a < m; a++)
      if (alive[a] && nn[a]! >= 0 && (i < 0 || nnCost[a]! < nnCost[i]!)) i = a;
    if (i < 0) break;
    const j = nn[i]!;
    const [keep, drop] = i < j ? [i, j] : [j, i];
    for (let c = 0; c < 3; c++) sum[keep]![c]! += sum[drop]![c]!;
    cnt[keep]! += cnt[drop]!;
    hasPin[keep] = hasPin[keep]! || hasPin[drop]!;
    alive[drop] = false;
    keeps.push(keep);
    drops.push(drop);
    rescan(keep);
    for (let c = 0; c < m; c++) {
      if (!alive[c] || c === keep) continue;
      if (nn[c] === keep || nn[c] === drop) rescan(c);
      else {
        const x = cost(c, keep);
        if (x < nnCost[c]!) {
          nnCost[c] = x;
          nn[c] = keep;
        }
      }
    }
  }

  const make = (kk: number): Clustering => {
    const target = Math.max(1, Math.min(kk - extra, m));
    const merges = Math.max(0, Math.min(keeps.length, m - target));
    const parent = h.n.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
      return x;
    };
    const n2 = [...h.n];
    const s2 = h.lab.map((c, i) => [h.n[i]! * c.L, h.n[i]! * c.a, h.n[i]! * c.b]);
    for (let t = 0; t < merges; t++) {
      const [keep, drop] = [keeps[t]!, drops[t]!];
      parent[drop] = keep;
      n2[keep]! += n2[drop]!;
      for (let c = 0; c < 3; c++) s2[keep]![c]! += s2[drop]![c]!;
    }
    const roots = h.n.map((_, i) => i).filter((i) => parent[i] === i);
    const pinRoot = pinBin >= 0 ? find(pinBin) : -1;
    const slot = new Map(roots.map((r, s) => [r, s]));
    const clusters: ColourCluster[] = roots.map((r) => ({
      lab:
        r === pinRoot
          ? h.lab[pinBin]!
          : { L: s2[r]![0]! / n2[r]!, a: s2[r]![1]! / n2[r]!, b: s2[r]![2]! / n2[r]! },
      count: n2[r]!,
      pinned: r === pinRoot,
    }));
    if (synthetic) clusters.push({ lab: pin!, count: 0, pinned: true });
    const nearestCentroid = (lab: Lab): number => {
      let best = -1;
      let bestD = Infinity;
      clusters.forEach((c, s) => {
        const d = dist2(c.lab, lab);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      });
      return best;
    };
    const cell = new Int32Array(h.binOf.length).fill(-2);
    const exact = new Map<number, number>();
    const assign = (r: number, g: number, b: number): number => {
      const id = ((r >> h.shift) << (2 * h.bits)) | ((g >> h.shift) << h.bits) | (b >> h.shift);
      let s = cell[id]!;
      if (s === -2) {
        const bin = h.binOf[id]!;
        if (bin >= 0) cell[id] = s = slot.get(find(bin))!;
        else {
          const key = (r << 16) | (g << 8) | b;
          s = exact.get(key) ?? -1;
          if (s < 0) exact.set(key, (s = nearestCentroid(rgbToLab([r, g, b]))));
        }
      }
      return s;
    };
    return { clusters, assign, assignLab: nearestCentroid, max: m + extra, cut: make };
  };
  return make(k);
}
