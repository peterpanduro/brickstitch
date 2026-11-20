import { allRows } from '../pattern/rows';
import type { Pattern } from '../pattern/types';
import { supportedMask } from './support';

/** Resolved ladder row; `invalidManual` flags a manual choice that fell back to auto. */
export interface LadderResolution {
  readonly row: number | null;
  readonly invalidManual: boolean;
}

const keptCount = (p: Pattern, row: number): number =>
  supportedMask(p, row).reduce((n, m) => n + m.reduce((k, v) => k + v, 0), 0);

/**
 * Automatic ladder row (SPEC §3.2, D1). Candidates: non-empty single-segment rows, else all
 * non-empty rows. Rank: kept beads desc, row bead count desc, row index asc. `null` if empty.
 */
export function chooseLadder(p: Pattern): number | null {
  const filled = allRows(p).filter((x) => x.count > 0);
  const single = filled.filter((x) => x.segments.length === 1);
  const ranked = (single.length > 0 ? single : filled).map((x) => ({
    r: x.r,
    count: x.count,
    kept: keptCount(p, x.r),
  }));
  ranked.sort((a, b) => b.kept - a.kept || b.count - a.count || a.r - b.r);
  return ranked[0]?.r ?? null;
}

/** Honours a manual ladder on a non-empty row; otherwise auto, flagging an invalid manual row. */
export function resolveLadder(p: Pattern): LadderResolution {
  if (p.ladder.kind === 'auto') return { row: chooseLadder(p), invalidManual: false };
  const row = p.cells[p.ladder.row];
  if (row?.some((c) => c !== null)) return { row: p.ladder.row, invalidManual: false };
  return { row: chooseLadder(p), invalidManual: true };
}
