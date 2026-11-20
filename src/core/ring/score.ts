import { BEAD_TYPES, extentMm, neighbours, type BeadTypeId, type Coord } from '../geometry';
import type { RingScore } from './types';

/** Score weights (SPEC R35). */
export const RING_WEIGHTS = {
  break: 10,
  clump: 5,
  lrAsym: 5,
  udAsym: 5,
  aspectMm: 3,
  spreadMm: 8,
  contourMm: 5,
  widthMissBeads: 20,
} as const;

const key = (r: number, h: number): number => (r + 4096) * 16384 + h + 8192;

/** Translation-normalised identity of a cell set, for deduplication and comparison. */
export function ringKey(cells: readonly Coord[]): string {
  const r0 = Math.min(...cells.map((c) => c.r));
  const h0 = Math.min(...cells.map((c) => c.h));
  return cells
    .map((c) => [c.r - r0, c.h - h0] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .join(';');
}

/** Values of `a` without an equal one-to-one partner in `b` (both sorted ascending). */
function unmatched(a: readonly number[], b: readonly number[]): number {
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    const d = (a[i] as number) - (b[j] as number);
    if (d === 0) {
      matched++;
      i++;
      j++;
    } else if (d < 0) i++;
    else j++;
  }
  return a.length - matched;
}

function longestRun(hs: readonly number[] = []): number {
  let best = 0;
  let run = 0;
  hs.forEach((h, i) => {
    run = i > 0 && h - (hs[i - 1] as number) === 2 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** Sorted h values per row. */
function rowsOf(cells: readonly Coord[]): Map<number, number[]> {
  const rows = new Map<number, number[]>();
  for (const c of cells) rows.set(c.r, [...(rows.get(c.r) ?? []), c.h]);
  for (const row of rows.values()) row.sort((a, b) => a - b);
  return rows;
}

/**
 * Up/down asymmetry about row axis `r2/2`. On a row (`r2` even) mirrors are exact; across a row
 * boundary (`r2` odd) the mirrored row has the other parity, so upper beads `(r, h)` pair with
 * `(r2 − r, h + s)` for one global shift `s ∈ {−1, +1}` (the better one).
 */
function udAsymmetry(rows: ReadonlyMap<number, readonly number[]>, r2: number): number {
  const count = (s: number) => {
    let n = 0;
    for (const [r, row] of rows) {
      const shift = 2 * r < r2 ? s : -s;
      n += unmatched(
        row.map((h) => h + shift),
        rows.get(r2 - r) ?? [],
      );
    }
    return n;
  };
  return (r2 & 1) === 0 ? count(0) : Math.min(count(-1), count(1));
}

/**
 * Scores a ring cell set (lattice coordinates, any translation); lower `total` is better.
 * Symmetry axes pass through the centre of the cells' extent: left/right mirrors must match
 * exactly, up/down as in {@link udAsymmetry}. `contourMm` is the RMS, over rows, of the outer
 * half-width (outermost bead edge) minus the half-width of the ellipse inscribed in the extent.
 * @throws RangeError on an empty set.
 */
export function scoreRing(cells: readonly Coord[], beadType: BeadTypeId = 'delica11'): RingScore {
  if (cells.length === 0) throw new RangeError('empty ring');
  const t = BEAD_TYPES[beadType];
  const half = t.widthMm / 2;
  const set = new Set(cells.map((c) => key(c.r, c.h)));
  const rows = rowsOf(cells);
  const rs = [...rows.keys()];
  const hs = cells.map((c) => c.h);
  const rmin = Math.min(...rs);
  const rmax = Math.max(...rs);
  const r2 = rmin + rmax;
  const h2 = Math.min(...hs) + Math.max(...hs);
  const cy = (r2 / 2) * t.rowPitchMm;
  let breaks = 0;
  let clumps = 0;
  const ds: number[] = [];
  for (const c of cells) {
    const n = neighbours(c).filter((q) => set.has(key(q.r, q.h))).length;
    if (n < 2) breaks++;
    if (n > 2) clumps++;
    ds.push(Math.hypot((c.h - h2 / 2) * half, c.r * t.rowPitchMm - cy));
  }
  const { width: widthMm, height: heightMm } = extentMm(cells, t);
  let lrAsym = 0;
  let contourSq = 0;
  for (const [r, row] of rows) {
    lrAsym += unmatched(row, row.map((h) => h2 - h).reverse());
    const outer = Math.max(h2 / 2 - (row[0] as number), (row.at(-1) as number) - h2 / 2) * half;
    const y = (r * t.rowPitchMm - cy) / (heightMm / 2);
    const ideal = (widthMm / 2) * Math.sqrt(Math.max(0, 1 - y * y));
    contourSq += (outer + half - ideal) ** 2;
  }
  const udAsym = udAsymmetry(rows, r2);
  const contourMm = Math.sqrt(contourSq / rows.size);
  const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
  const spreadMm = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / ds.length);
  const aspectMm = Math.abs(widthMm - heightMm);
  const w = RING_WEIGHTS;
  return {
    breaks,
    clumps,
    lrAsym,
    udAsym,
    aspectMm,
    spreadMm,
    contourMm,
    beadCount: cells.length,
    widthBeads: (Math.max(...hs) - Math.min(...hs)) / 2 + 1,
    heightRows: rmax - rmin + 1,
    widthMm,
    heightMm,
    topRun: longestRun(rows.get(rmin)),
    bottomRun: longestRun(rows.get(rmax)),
    total:
      w.break * breaks +
      w.clump * clumps +
      w.lrAsym * lrAsym +
      w.udAsym * udAsym +
      w.aspectMm * aspectMm +
      w.spreadMm * spreadMm +
      w.contourMm * contourMm,
  };
}
