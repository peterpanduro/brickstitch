import { rgbToLab } from '../palette/color';
import type { Lab } from '../palette/types';

/** One colour cluster: true (count-weighted) Lab centroid of its pixels. */
export interface ColourCluster {
  readonly lab: Lab;
  readonly count: number;
  /** The cluster that must map to the pinned colour (panel background). */
  readonly pinned: boolean;
}

/** Result of {@link clusterColours}. */
export interface Clustering {
  readonly clusters: readonly ColourCluster[];
  /** Cluster of an RGB colour (cached; a colour in an unseen bin goes to the nearest centroid). */
  readonly assign: (r: number, g: number, b: number) => number;
  /** Cluster of a Lab colour (same rule). */
  readonly assignLab: (lab: Lab) => number;
}

/** Options of {@link clusterColours}. */
export interface ClusterOptions {
  /** Clusters to keep (at least 1). */
  readonly k: number;
  /** Colour of a cluster that is never merged away: the pinned colour of the pattern. */
  readonly pin?: Lab;
}

const STEP = 4;
const PIN_RADIUS = 20;
const SIDE = 64;

const binKey = ({ L, a, b }: Lab): number =>
  ((Math.floor(L / STEP) * SIDE + Math.floor((a + 128) / STEP)) * SIDE +
    Math.floor((b + 128) / STEP)) |
  0;

const dist2 = (a: Lab, b: Lab): number => (a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

/**
 * Clusters the colours of the pixels where `include` is set (RGBA `data`): a Lab histogram
 * (4-unit bins) is merged by Ward's rule until `k` clusters remain, so shades of one colour
 * merge before a small distinct colour is lost. The cost is `√(nₐ·n_b/(nₐ+n_b))·ΔE²` (ΔE76 on the
 * centroids): the square root of Ward's count weight keeps a large smooth gradient from
 * outweighing two small colours that are far apart (pink cheeks against a red mouth). With `pin`, the largest bin within ΔE 20 of it is pinned (it absorbs, is never absorbed
 * and counts towards `k`); without such a bin an empty pinned cluster is reserved. Deterministic.
 */
export function clusterColours(
  data: Uint8ClampedArray,
  include: Uint8Array,
  { k, pin }: ClusterOptions,
): Clustering {
  const labOf = new Map<number, Lab>();
  const rgbBin = new Map<number, number>();
  const binIndex = new Map<number, number>();
  const sum: number[][] = [];
  const toLab = (r: number, g: number, b: number): Lab => {
    const key = (r << 16) | (g << 8) | b;
    let lab = labOf.get(key);
    if (!lab) labOf.set(key, (lab = rgbToLab([r, g, b])));
    return lab;
  };
  for (let p = 0; p < include.length; p++) {
    if (!include[p]) continue;
    const r = data[p * 4]!;
    const g = data[p * 4 + 1]!;
    const b = data[p * 4 + 2]!;
    const rgb = (r << 16) | (g << 8) | b;
    let bin = rgbBin.get(rgb);
    const lab = toLab(r, g, b);
    if (bin === undefined) {
      const key = binKey(lab);
      bin = binIndex.get(key);
      if (bin === undefined) {
        bin = sum.length;
        binIndex.set(key, bin);
        sum.push([0, 0, 0, 0]);
      }
      rgbBin.set(rgb, bin);
    }
    const s = sum[bin]!;
    s[0]!++;
    s[1]! += lab.L;
    s[2]! += lab.a;
    s[3]! += lab.b;
  }

  const n: number[] = sum.map((s) => s[0]!);
  const cen: Lab[] = sum.map((s) => ({ L: s[1]! / s[0]!, a: s[2]! / s[0]!, b: s[3]! / s[0]! }));
  const pinned: boolean[] = n.map(() => false);
  const frozen: boolean[] = n.map(() => false);
  if (pin) {
    let best = -1;
    cen.forEach((c, i) => {
      if (dist2(c, pin) <= PIN_RADIUS ** 2 && (best < 0 || n[i]! > n[best]!)) best = i;
    });
    if (best >= 0) pinned[best] = true;
    else {
      n.push(0);
      cen.push(pin);
      pinned.push(true);
      frozen.push(true);
    }
  }
  const m = n.length;
  const alive: boolean[] = n.map(() => true);
  const owner = n.map((_, i) => i);
  const cost = (a: number, b: number): number =>
    frozen[a] || frozen[b]
      ? Infinity
      : Math.sqrt((n[a]! * n[b]!) / (n[a]! + n[b]!)) * dist2(cen[a]!, cen[b]!);
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

  let left = m;
  const target = Math.max(1, k);
  while (left > target) {
    let i = -1;
    for (let a = 0; a < m; a++)
      if (alive[a] && nn[a]! >= 0 && (i < 0 || nnCost[a]! < nnCost[i]!)) i = a;
    if (i < 0) break;
    const j = nn[i]!;
    const [keep, drop] = i < j ? [i, j] : [j, i];
    const t = n[keep]! + n[drop]!;
    cen[keep] = {
      L: (cen[keep]!.L * n[keep]! + cen[drop]!.L * n[drop]!) / t,
      a: (cen[keep]!.a * n[keep]! + cen[drop]!.a * n[drop]!) / t,
      b: (cen[keep]!.b * n[keep]! + cen[drop]!.b * n[drop]!) / t,
    };
    n[keep] = t;
    pinned[keep] = pinned[keep]! || pinned[drop]!;
    alive[drop] = false;
    for (let b = 0; b < m; b++) if (owner[b] === drop) owner[b] = keep;
    left--;
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

  const ids = [...alive.keys()].filter((a) => alive[a]);
  const slot = new Map(ids.map((a, s) => [a, s]));
  const clusters: ColourCluster[] = ids.map((a) => ({
    lab: cen[a]!,
    count: n[a]!,
    pinned: pinned[a]!,
  }));
  const ofBin = new Map<number, number>();
  for (const [key, b] of binIndex) ofBin.set(key, slot.get(owner[b]!)!);
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
  const assignLab = (lab: Lab): number => {
    const key = binKey(lab);
    let s = ofBin.get(key);
    if (s === undefined) ofBin.set(key, (s = nearestCentroid(lab)));
    return s;
  };
  const rgbSlot = new Map<number, number>();
  const assign = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    let s = rgbSlot.get(key);
    if (s === undefined) rgbSlot.set(key, (s = assignLab(toLab(r, g, b))));
    return s;
  };
  return { clusters, assign, assignLab };
}
