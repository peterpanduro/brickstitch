import type { Analysis } from '../analyse';
import { BEAD_STATUS } from '../feasibility/support';
import { iOf, type Coord } from '../geometry';
import { getCell } from '../pattern/ops';
import type { Pattern } from '../pattern/types';
import type { BeadMark } from './types';

/** Map key of a lattice coordinate (h < 1024 since width ≤ 80). */
export const markKey = (r: number, h: number): number => r * 1024 + h;

/** Follows a thinLine chain away from the ladder: up to `length` beads from `start`. */
function chain(p: Pattern, ladderRow: number, start: Coord, length: number): Coord[] {
  const out = [start];
  for (let c = start; out.length < length;) {
    const r = c.r < ladderRow ? c.r - 1 : c.r + 1;
    const next = [c.h - 1, c.h + 1].map((h) => ({ r, h })).find((n) => getCell(p, n));
    if (!next) break;
    out.push((c = next));
  }
  return out;
}

/** Mark per bead keyed by {@link markKey}: floating/extraLadder from status, thin from chains. */
export function beadMarks(p: Pattern, a: Analysis): Map<number, BeadMark> {
  const marks = new Map<number, BeadMark>();
  for (const w of a.warnings) {
    if (w.code === 'thinLine' && a.ladderRow !== null) {
      for (const c of chain(p, a.ladderRow, w, w.value)) marks.set(markKey(c.r, c.h), 'thin');
    } else if (w.code === 'floating' || w.code === 'needsExtraLadder') {
      const floating = a.status[w.r]?.[iOf(w.r, w.h)] === BEAD_STATUS.floating;
      marks.set(markKey(w.r, w.h), floating ? 'floating' : 'extraLadder');
    }
  }
  return marks;
}
