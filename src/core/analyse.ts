import { buildInstructions } from './instructions/build';
import type { Instructions } from './instructions/types';
import type { Pattern } from './pattern/types';
import { resolveLadder } from './feasibility/ladder';
import { beadStatus, supportedMask, type CellMask } from './feasibility/support';
import type { Warning } from './feasibility/types';
import { warnings } from './feasibility/warnings';

/** Everything the editor and export need for one ladder row, computed from one support mask. */
export interface Analysis {
  readonly ladderRow: number | null;
  readonly invalidManual: boolean;
  readonly status: CellMask;
  readonly warnings: readonly Warning[];
  /** Absent when the pattern is empty. */
  readonly instructions?: Instructions;
}

/**
 * Resolves the ladder (or uses `ladderRow`, e.g. pinned during a drag stroke, SPEC R12) and
 * computes bead status, warnings and instructions, sharing one `supportedMask`.
 */
export function analyse(p: Pattern, ladderRow?: number): Analysis {
  const { row, invalidManual } =
    ladderRow === undefined ? resolveLadder(p) : { row: ladderRow, invalidManual: false };
  if (row === null) {
    const status = p.cells.map((r) => new Uint8Array(r.length));
    return { ladderRow: null, invalidManual, status, warnings: warnings(p, -1, status, status) };
  }
  const supported = supportedMask(p, row);
  const status = beadStatus(p, row, supported);
  return {
    ladderRow: row,
    invalidManual,
    status,
    warnings: warnings(p, row, supported, status),
    instructions: buildInstructions(p, row, status),
  };
}
