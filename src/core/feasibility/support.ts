import { iOf } from '../geometry';
import { rowInfo } from '../pattern/rows';
import type { Pattern } from '../pattern/types';

/** Per-bead feasibility state stored in a status mask. */
export const BEAD_STATUS = {
  empty: 0,
  supported: 1,
  extraLadder: 2,
  floating: 3,
} as const;

/** One of the `BEAD_STATUS` values. */
export type BeadStatus = (typeof BEAD_STATUS)[keyof typeof BEAD_STATUS];

/** Per-cell flags aligned with `Pattern.cells` (`mask[r][i]`). */
export type CellMask = readonly Uint8Array[];

/** Row toward the ladder from row `r`. */
export const towardLadder = (r: number, ladderRow: number): number =>
  r < ladderRow ? r + 1 : r - 1;

/**
 * Indices in an adjacent row of the two beads under/over bead `i` of row `r`
 * (doubled `h ± 1`).
 */
export const supportIndices = (r: number, i: number): readonly [number, number] => [
  i - 1 + (r & 1),
  i + (r & 1),
];

/** Visits `ladderRow`, then rows up to the top, then rows down to the bottom. */
function sweep(height: number, ladderRow: number, fill: (r: number) => void): void {
  if (ladderRow >= 0 && ladderRow < height) fill(ladderRow);
  for (let r = Math.min(ladderRow, height) - 1; r >= 0; r--) fill(r);
  for (let r = Math.max(ladderRow + 1, 0); r < height; r++) fill(r);
}

/**
 * Beads kept by the prototype fixpoint (`ripa3/lib.py:_prune`), computed with one outward
 * sweep from `ladderRow` (SPEC §3.1): a bead off the ladder is supported when a supported
 * bead sits at `h ± 1` in the adjacent row toward the ladder.
 */
export function supportedMask(p: Pattern, ladderRow: number): CellMask {
  const mask = p.cells.map((row) => new Uint8Array(row.length));
  sweep(p.height, ladderRow, (r) => {
    const out = mask[r] as Uint8Array;
    const from = mask[towardLadder(r, ladderRow)];
    (p.cells[r] ?? []).forEach((c, i) => {
      if (c === null) return;
      const [a, b] = supportIndices(r, i);
      out[i] = r === ladderRow || (from !== undefined && (from[a] || from[b])) ? 1 : 0;
    });
  });
  return mask;
}

const anchored = (s: number | undefined): boolean =>
  s === BEAD_STATUS.supported || s === BEAD_STATUS.extraLadder;

/**
 * Classifies every bead (SPEC §3.3, R1) in one outward sweep from the ladder. A row segment is
 * anchored when it lies on the ladder row or any of its beads rests on an anchored bead toward
 * the ladder; every bead of an anchored segment is anchored. Status: `supported` (in
 * `supported`), `extraLadder` (anchored, not supported), `floating` (not anchored).
 */
export function beadStatus(
  p: Pattern,
  ladderRow: number,
  supported: CellMask = supportedMask(p, ladderRow),
): CellMask {
  const status = p.cells.map((row) => new Uint8Array(row.length));
  sweep(p.height, ladderRow, (r) => {
    const out = status[r] as Uint8Array;
    const sup = supported[r] as Uint8Array;
    const from = status[towardLadder(r, ladderRow)];
    for (const seg of rowInfo(p, r).segments) {
      const lo = iOf(r, seg.hStart);
      const hi = iOf(r, seg.hEnd);
      let isAnchored = r === ladderRow;
      for (let i = lo; i <= hi && !isAnchored; i++) {
        isAnchored = supportIndices(r, i).some((j) => anchored(from?.[j]));
      }
      const unsupported = isAnchored ? BEAD_STATUS.extraLadder : BEAD_STATUS.floating;
      for (let i = lo; i <= hi; i++) out[i] = sup[i] ? BEAD_STATUS.supported : unsupported;
    }
  });
  return status;
}
