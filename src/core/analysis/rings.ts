import type { LabelImage } from './label';

/** Angle bins of the circle coverage test and the ray verifier (SPEC R37). */
export const RING_BINS = 72;

const MAX_POINTS = 4000;
const TRIALS = 400;
const MAX_CIRCLES = 12;
const MIN_COVERAGE = 0.9;
const MAX_RMS = 0.04;
const MAX_GAP_BINS = 2;
/** How far outside (in stroke widths) the background-band test looks. */
const BAND_REACH = 3;
/** RMS floor in px: pixel staircase noise of small circles (≈ 0.5 px). */
const MIN_RMS_PX = 0.6;
const DEFAULT_SEED = 0x2f6b9a1d;

/** Options of {@link detectRings}; radii in working px. */
export interface DetectRingsOptions {
  readonly minRadiusPx: number;
  readonly maxRadiusPx: number;
  /** PRNG seed (default fixed, so detection is deterministic). */
  readonly seed?: number;
}

/** A ring stroke found in a label image; coordinates are pixel indices (pixel centre = index). */
export interface DetectedRing {
  readonly cx: number;
  readonly cy: number;
  readonly rIn: number;
  readonly rOut: number;
  /** Stroke width `rOut − rIn`. */
  readonly w: number;
  /** Mid radius `(rIn + rOut) / 2`. */
  readonly rM: number;
  /** Stroke label per angle bin (`atan2` order from −π), `−1` where the ray test failed. */
  readonly strokeLabel: Int16Array;
  /** Fraction of bins that passed the ray test. */
  readonly coverage: number;
}

/** A fitted circle (pixel-index coordinates). */
export interface Circle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** Seeded PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const binOf = (dx: number, dy: number): number =>
  Math.min(RING_BINS - 1, Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * RING_BINS));

/**
 * Edge pixels (a 4-neighbour has another label, `−1` included), both sides, as a stride subsample
 * of at most {@link MAX_POINTS}. Pixels on or outside a crop border are excluded: a side of the
 * labelled bounding box that is more than half labelled (a straight image edge, not a curve
 * touching the box).
 */
function edgePoints(l: LabelImage): { xs: Float64Array; ys: Float64Array } {
  const { labels, w, h } = l;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < labels.length; p++)
    if (labels[p]! >= 0) {
      const x = p % w;
      const y = (p - x) / w;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const labelled = (n: number, at: (i: number) => number): boolean => {
    let k = 0;
    for (let i = 0; i < n; i++) if (labels[at(i)]! >= 0) k++;
    return 2 * k > n;
  };
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const xa = labelled(rows, (i) => (y0 + i) * w + x0) ? x0 + 1 : 1;
  const xb = labelled(rows, (i) => (y0 + i) * w + x1) ? x1 - 1 : w - 2;
  const ya = labelled(cols, (i) => y0 * w + x0 + i) ? y0 + 1 : 1;
  const yb = labelled(cols, (i) => y1 * w + x0 + i) ? y1 - 1 : h - 2;
  const scan = (visit: (x: number, y: number) => void): void => {
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const p = y * w + x;
        const k = labels[p]!;
        if (
          labels[p - 1] !== k ||
          labels[p + 1] !== k ||
          labels[p - w] !== k ||
          labels[p + w] !== k
        )
          visit(x, y);
      }
  };
  let total = 0;
  scan(() => total++);
  const stride = Math.max(1, Math.ceil(total / MAX_POINTS));
  const n = Math.ceil(total / stride);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let i = 0;
  scan((x, y) => {
    if (i % stride === 0) {
      xs[i / stride] = x;
      ys[i / stride] = y;
    }
    i++;
  });
  return { xs, ys };
}

function circumcircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): Circle | null {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

/** Kasa algebraic least-squares circle through the points `idx`; `null` when degenerate. */
function kasa(xs: Float64Array, ys: Float64Array, idx: readonly number[]): Circle | null {
  const n = idx.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const i of idx) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suz = 0;
  let svz = 0;
  let sz = 0;
  for (const i of idx) {
    const u = xs[i]! - mx;
    const v = ys[i]! - my;
    const z = u * u + v * v;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    suz += u * z;
    svz += v * z;
    sz += z;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const D = -(suz * svv - svz * suv) / det;
  const E = -(svz * suu - suz * suv) / det;
  const F = -sz / n;
  const r2 = (D * D + E * E) / 4 - F;
  if (!(r2 > 0)) return null;
  return { cx: mx - D / 2, cy: my - E / 2, r: Math.sqrt(r2) };
}

const band = (r: number): number => Math.max(1, 0.03 * r);

/** Inliers of `c` among `active`, and how many angle bins they cover. */
function inliers(
  c: Circle,
  xs: Float64Array,
  ys: Float64Array,
  active: readonly number[],
): { idx: number[]; bins: number } {
  const eps = band(c.r);
  const idx: number[] = [];
  const hit = new Uint8Array(RING_BINS);
  let bins = 0;
  for (const i of active) {
    const dx = xs[i]! - c.cx;
    const dy = ys[i]! - c.cy;
    if (Math.abs(Math.hypot(dx, dy) - c.r) > eps) continue;
    idx.push(i);
    const b = binOf(dx, dy);
    if (!hit[b]) {
      hit[b] = 1;
      bins++;
    }
  }
  return { idx, bins };
}

/** RANSAC circles (SPEC R37): best of {@link TRIALS} triplets, Kasa-refined twice, accepted or stop. */
function findCircles(xs: Float64Array, ys: Float64Array, o: DetectRingsOptions): Circle[] {
  const rnd = mulberry32(o.seed ?? DEFAULT_SEED);
  let active = Array.from(xs, (_, i) => i);
  const out: Circle[] = [];
  const inRange = (c: Circle | null): c is Circle =>
    c !== null && c.r >= o.minRadiusPx && c.r <= o.maxRadiusPx;
  while (out.length < MAX_CIRCLES && active.length >= 3) {
    let best: Circle | null = null;
    let bestBins = 0;
    let bestN = 0;
    for (let t = 0; t < TRIALS; t++) {
      const n = active.length;
      const a = active[Math.floor(rnd() * n)]!;
      const b = active[Math.floor(rnd() * n)]!;
      const c = active[Math.floor(rnd() * n)]!;
      if (a === b || b === c || a === c) continue;
      const h = circumcircle(xs[a]!, ys[a]!, xs[b]!, ys[b]!, xs[c]!, ys[c]!);
      if (!inRange(h)) continue;
      const s = inliers(h, xs, ys, active);
      if (s.bins > bestBins || (s.bins === bestBins && s.idx.length > bestN)) {
        best = h;
        bestBins = s.bins;
        bestN = s.idx.length;
      }
    }
    if (!best) break;
    let c: Circle = best;
    let s = inliers(c, xs, ys, active);
    for (let k = 0; k < 2; k++) {
      const f = kasa(xs, ys, s.idx);
      if (!f) break;
      c = f;
      s = inliers(c, xs, ys, active);
    }
    let sq = 0;
    for (const i of s.idx) sq += (Math.hypot(xs[i]! - c.cx, ys[i]! - c.cy) - c.r) ** 2;
    const rms = s.idx.length ? Math.sqrt(sq / s.idx.length) : Infinity;
    if (
      !inRange(c) ||
      s.bins < MIN_COVERAGE * RING_BINS ||
      rms > Math.max(MAX_RMS * c.r, MIN_RMS_PX)
    )
      break;
    out.push(c);
    const gone = new Set(s.idx);
    active = active.filter((i) => !gone.has(i));
  }
  return out;
}

/** Longest run of `−1` bins, circularly. */
function longestGap(labels: Int16Array): number {
  let best = 0;
  let run = 0;
  for (let k = 0; k < 2 * RING_BINS && best < RING_BINS; k++) {
    run = labels[k % RING_BINS]! < 0 ? run + 1 : 0;
    best = Math.max(best, Math.min(run, RING_BINS));
  }
  return best;
}

/**
 * Ray verifier of a stroke between two concentric circles; `null` when it fails: coverage < 0.9,
 * a gap of more than {@link MAX_GAP_BINS} consecutive failed bins (a C or G), or a background
 * band: in most passing bins the stroke label reappears beyond another label both inside (towards
 * the centre) and outside (within {@link BAND_REACH} stroke widths), e.g. the gap between two
 * rings on a panel.
 */
function verify(l: LabelImage, a: Circle, b: Circle): DetectedRing | null {
  const cx = (a.cx + b.cx) / 2;
  const cy = (a.cy + b.cy) / 2;
  const rIn = a.r;
  const rOut = b.r;
  const w = rOut - rIn;
  const rM = (rIn + rOut) / 2;
  const delta = Math.max(1, w / 4);
  const at = (r: number, cos: number, sin: number): number => {
    const x = Math.round(cx + r * cos);
    const y = Math.round(cy + r * sin);
    return x < 0 || y < 0 || x >= l.w || y >= l.h ? -1 : l.labels[y * l.w + x]!;
  };
  const reappears = (from: number, to: number, m: number, cos: number, sin: number): boolean => {
    const step = to > from ? 1 : -1;
    let left = false;
    for (let r = from; step > 0 ? r <= to : r >= Math.max(0, to); r += step) {
      const k = at(r, cos, sin);
      if (k !== m) left = true;
      else if (left) return true;
    }
    return false;
  };
  const strokeLabel = new Int16Array(RING_BINS).fill(-1);
  let pass = 0;
  let band = 0;
  for (let k = 0; k < RING_BINS; k++) {
    const th = ((k + 0.5) / RING_BINS) * 2 * Math.PI - Math.PI;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const m = at(rM, cos, sin);
    if (
      m < 0 ||
      m === at(rOut + delta, cos, sin) ||
      m === at(rIn - delta, cos, sin) ||
      m !== at(rM + 0.3 * w, cos, sin) ||
      m !== at(rM - 0.3 * w, cos, sin)
    )
      continue;
    strokeLabel[k] = m;
    pass++;
    if (reappears(rM, 0, m, cos, sin) && reappears(rM, rOut + BAND_REACH * w, m, cos, sin)) band++;
  }
  const coverage = pass / RING_BINS;
  if (coverage < MIN_COVERAGE || longestGap(strokeLabel) > MAX_GAP_BINS || 2 * band > pass)
    return null;
  return { cx, cy, rIn, rOut, w, rM, strokeLabel, coverage };
}

/**
 * Pairs concentric circles into verified strokes, each circle used at most once: the set of
 * disjoint verified pairs with the most strokes, then the smallest total radius difference
 * (so the gap between two rings never takes the circles of both).
 */
export function pairStrokes(l: LabelImage, circles: readonly Circle[]): DetectedRing[] {
  const cs = [...circles].sort((a, b) => a.r - b.r || a.cx - b.cx || a.cy - b.cy);
  const n = cs.length;
  const ok = new Map<number, DetectedRing>();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = cs[i]!;
      const b = cs[j]!;
      const w = b.r - a.r;
      if (w <= 0 || Math.hypot(a.cx - b.cx, a.cy - b.cy) > Math.max(1.5, 0.1 * w)) continue;
      const ring = verify(l, a, b);
      if (ring) ok.set(i * n + j, ring);
    }
  type Best = { count: number; diff: number; pairs: number[] };
  const memo = new Map<number, Best>();
  const solve = (used: number): Best => {
    const hit = memo.get(used);
    if (hit) return hit;
    let i = 0;
    while (i < n && used & (1 << i)) i++;
    let best: Best = { count: 0, diff: 0, pairs: [] };
    if (i < n) {
      best = solve(used | (1 << i));
      for (let j = i + 1; j < n; j++) {
        const ring = ok.get(i * n + j);
        if (!ring || used & (1 << j)) continue;
        const rest = solve(used | (1 << i) | (1 << j));
        const cand = {
          count: rest.count + 1,
          diff: rest.diff + ring.w,
          pairs: [i * n + j, ...rest.pairs],
        };
        if (cand.count > best.count || (cand.count === best.count && cand.diff < best.diff - 1e-9))
          best = cand;
      }
    }
    memo.set(used, best);
    return best;
  };
  return solve(0)
    .pairs.map((k) => ok.get(k)!)
    .sort((a, b) => a.rM - b.rM || a.cx - b.cx || a.cy - b.cy);
}

/**
 * Ring strokes in a label image (SPEC R37): RANSAC circles on the edge pixels, verified
 * concentric pairs (most strokes, then smallest radius differences). Deterministic.
 */
export function detectRings(l: LabelImage, o: DetectRingsOptions): DetectedRing[] {
  if (l.w < 3 || l.h < 3) return [];
  const { xs, ys } = edgePoints(l);
  return pairStrokes(l, findCircles(xs, ys, o));
}

/**
 * Stroke label at angle `theta` (radians, `atan2` convention): its bin, else the nearest valid bin
 * within {@link MAX_GAP_BINS}; `−1` when there is none.
 */
export function strokeLabelAt(ring: DetectedRing, theta: number): number {
  const b = binOf(Math.cos(theta), Math.sin(theta));
  for (let d = 0; d <= MAX_GAP_BINS; d++)
    for (const k of [b - d, b + d]) {
      const v = ring.strokeLabel[(k + RING_BINS) % RING_BINS]!;
      if (v >= 0) return v;
    }
  return -1;
}
