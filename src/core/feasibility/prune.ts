import type { Pattern } from '../pattern/types';
import { BEAD_STATUS, beadStatus } from './support';

/** Removes `floating` beads only (SPEC R1); `needsExtraLadder` beads and the ladder stay. */
export function prune(p: Pattern, ladderRow: number): Pattern {
  const status = beadStatus(p, ladderRow);
  return {
    ...p,
    cells: p.cells.map((row, r) =>
      row.map((c, i) => (status[r]?.[i] === BEAD_STATUS.floating ? null : c)),
    ),
  };
}
