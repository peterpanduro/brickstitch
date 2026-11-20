import { BEAD_TYPES, type BeadType, type Coord } from '../geometry';
import { RING_WEIGHTS, ringKey, scoreRing } from './score';
import type { RingCandidate, RingCentre, RingSearchParams } from './types';

const STEP = 5;
const EPS = 1e-9;

interface Cell extends Coord {
  readonly d: number;
}

/** Lattice cells around the anchor bead, sorted by distance from the centre. */
function cellsByDistance(c: RingCentre, t: BeadType, reachMm: number): Cell[] {
  const cx = c.onBead ? 0 : t.widthMm / 2;
  const cy = c.onRow ? 0 : t.rowPitchMm / 2;
  const rr = Math.ceil(reachMm / t.rowPitchMm) + 1;
  const hr = Math.ceil(reachMm / (t.widthMm / 2)) + 2;
  const out: Cell[] = [];
  for (let r = -rr; r <= rr + 1; r++) {
    for (let h = -hr; h <= hr + 1; h++) {
      if ((h - r) % 2 !== 0) continue;
      out.push({ r, h, d: Math.hypot((h * t.widthMm) / 2 - cx, r * t.rowPitchMm - cy) });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.r - b.r || a.h - b.h);
}

const lowerBound = (cells: readonly Cell[], x: number): number => {
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cells[mid] as Cell).d < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** On-bead centre kinds (on a row or a row boundary): centred placement on a panel (R36, R37). */
export const ON_BEAD_CENTRES: readonly RingCentre[] = [
  { onBead: true, onRow: true },
  { onBead: true, onRow: false },
];

const ALL_CENTRES: readonly RingCentre[] = [true, false].flatMap((onBead) =>
  [true, false].map((onRow) => ({ onBead, onRow })),
);

function validate(p: RingSearchParams, t: BeadType): number {
  const w = p.targetWidthBeads ?? (p.targetDiameterMm ?? NaN) / t.widthMm;
  if (!(w >= 3)) throw new RangeError('target width must be at least 3 beads');
  const max = p.maxCandidates ?? 6;
  if (!Number.isInteger(max) || max < 1) throw new RangeError('maxCandidates must be ≥ 1');
  const th = p.thicknessMm;
  if (th && !(th.min > 0 && th.min <= th.max)) {
    throw new RangeError('thickness range needs 0 < min ≤ max');
  }
  if (p.centres?.length === 0) throw new RangeError('centres must not be empty');
  return w;
}

/**
 * Searches ring cell sets (SPEC R35): centre on a bead or between beads, on a row or a row
 * boundary; radius R in 0.05 mm steps around the target; ring = cells with |d − R| ≤ t.
 * Identical cell sets (up to translation) are merged. Returns the best `maxCandidates`, best first.
 * @throws RangeError when no valid target is given.
 */
export function ringCandidates(p: RingSearchParams): RingCandidate[] {
  const bead = p.beadType ?? 'delica11';
  const t = BEAD_TYPES[bead];
  const target = validate(p, t);
  const tMin = Math.round((p.thicknessMm?.min ?? 0.55) * 100);
  const tMax = Math.round((p.thicknessMm?.max ?? 0.9) * 100);
  const rMid = Math.round((((target - 1) / 2) * t.widthMm * 100) / STEP) * STEP;
  const rMin = Math.max(STEP, rMid - 150);
  const rMax = rMid + 150;
  const best = new Map<string, RingCandidate>();
  for (const centre of p.centres ?? ALL_CENTRES) {
    const cells = cellsByDistance(centre, t, (rMax + tMax) / 100);
    const seen = new Set<string>();
    for (let R = rMin; R <= rMax; R += STEP) {
      for (let th = tMin; th <= tMax; th += STEP) {
        const i0 = lowerBound(cells, (R - th) / 100 - EPS);
        const i1 = lowerBound(cells, (R + th) / 100 + EPS);
        const span = `${i0}:${i1}`;
        if (i1 <= i0 || seen.has(span)) continue;
        seen.add(span);
        const ring = cells
          .slice(i0, i1)
          .map(({ r, h }) => ({ r, h }))
          .sort((a, b) => a.r - b.r || a.h - b.h);
        const s = scoreRing(ring, bead);
        const widthMissBeads = Math.abs(s.widthBeads - target);
        const total = s.total + RING_WEIGHTS.widthMissBeads * widthMissBeads;
        const cand: RingCandidate = {
          cells: ring,
          centre: { onBead: centre.onBead, onRow: centre.onRow },
          radiusMm: R / 100,
          thicknessMm: th / 100,
          score: { ...s, widthMissBeads, total },
        };
        const k = ringKey(ring);
        const prev = best.get(k);
        if (!prev || total < prev.score.total) best.set(k, cand);
      }
    }
  }
  const keyed = [...best].sort(
    ([ka, a], [kb, b]) => a.score.total - b.score.total || (ka < kb ? -1 : ka > kb ? 1 : 0),
  );
  return keyed.slice(0, p.maxCandidates ?? 6).map(([, c]) => c);
}
