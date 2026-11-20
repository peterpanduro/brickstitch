import { BEAD_TYPES, type Coord } from '../geometry';
import { getCell, paintCells } from '../pattern/ops';
import type { ColorId, Pattern } from '../pattern/types';
import type { RingCandidate, RingPlacement } from './types';

/**
 * Lattice cells of `candidate` with its anchor bead at `anchor`; cells off the lattice are
 * counted in `clipped`.
 * @throws RangeError when `anchor` is not a lattice cell (`h − r` odd).
 */
export function ringCellsAt(
  pattern: Pattern,
  candidate: RingCandidate,
  anchor: Coord,
): RingPlacement {
  if ((anchor.h - anchor.r) % 2 !== 0) {
    throw new RangeError('anchor parity: h − r must be even');
  }
  const all = candidate.cells.map((c) => ({ r: anchor.r + c.r, h: anchor.h + c.h }));
  const cells = all.filter((c) => getCell(pattern, c) !== undefined);
  return { cells, clipped: all.length - cells.length };
}

/**
 * Paints `candidate` at `anchor` (see {@link ringCellsAt}).
 * @throws like {@link ringCellsAt}, and like {@link paintCells} for an unknown colour.
 */
export function placeRing(
  pattern: Pattern,
  candidate: RingCandidate,
  anchor: Coord,
  color: ColorId | null,
): { pattern: Pattern; clipped: number } {
  const { cells, clipped } = ringCellsAt(pattern, candidate, anchor);
  return { pattern: paintCells(pattern, cells, color), clipped };
}

/**
 * Anchor (any lattice cell, possibly off the pattern) that puts the ring centre of `candidate`
 * closest to the point `(xMm, yMm)` in lattice-local mm (origin at the lattice's top-left, as in
 * `hitTest`). Ties go to the smaller r, then the smaller h.
 */
export function ringAnchorFromClick(
  pattern: Pattern,
  xMm: number,
  yMm: number,
  candidate: RingCandidate,
): Coord {
  const t = BEAD_TYPES[pattern.beadType];
  const half = t.widthMm / 2;
  const dh = candidate.centre.onBead ? 0 : 1;
  const dr = candidate.centre.onRow ? 0 : 0.5;
  const rf = (yMm - t.rowPitchMm / 2) / t.rowPitchMm - dr;
  const hf = (xMm - half) / half - dh;
  let best: Coord = { r: 0, h: 0 };
  let bestD = Infinity;
  for (let r = Math.floor(rf) - 1; r <= Math.ceil(rf) + 1; r++) {
    for (let h = Math.floor(hf) - 2; h <= Math.ceil(hf) + 2; h++) {
      if ((h - r) % 2 !== 0) continue;
      const d = Math.hypot((h - hf) * half, (r - rf) * t.rowPitchMm);
      if (d < bestD - 1e-12) {
        best = { r, h };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Centred anchor (SPEC R36): the ring centre on the middle column and on the row nearest `yMm`
 * (lattice-local mm) that the lattice parity allows (ties: smaller r).
 */
export function ringAnchorCentred(pattern: Pattern, candidate: RingCandidate, yMm: number): Coord {
  const t = BEAD_TYPES[pattern.beadType];
  const h = pattern.width - 1 - (candidate.centre.onBead ? 0 : 1);
  const rf = (yMm - t.rowPitchMm / 2) / t.rowPitchMm - (candidate.centre.onRow ? 0 : 0.5);
  const par = h & 1;
  return { r: 2 * Math.ceil((rf - par) / 2 - 0.5) + par, h };
}
