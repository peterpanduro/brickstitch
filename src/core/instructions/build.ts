import { BEAD_TYPES, extentMm, type Coord } from '../geometry';
import { beadStatus, towardLadder, type CellMask } from '../feasibility/support';
import { allRows, beadCoords, rowNumbers } from '../pattern/rows';
import type { ColorId, Pattern, RowInfo } from '../pattern/types';
import { extraLadderNotes, shapedRowNotes } from './notes';
import type { Instructions, RowInstruction, RowNote, Run } from './types';

/** Groups consecutive equal colours into runs. */
export function toRuns(colors: readonly ColorId[]): Run[] {
  const runs: { color: ColorId; length: number }[] = [];
  for (const color of colors) {
    const last = runs[runs.length - 1];
    if (last?.color === color) last.length++;
    else runs.push({ color, length: 1 });
  }
  return runs;
}

/**
 * Loop attachment (SPEC §4, R5): the topmost bead within half a bead of the centroid,
 * `|N·h − Σh| ≤ N` in integers; ties go left. `null` if no bead qualifies.
 */
export function loopPoint(p: Pattern): Coord | null {
  const beads = beadCoords(p);
  const n = beads.length;
  const sum = beads.reduce((s, b) => s + b.h, 0);
  return beads.find((b) => Math.abs(n * b.h - sum) <= n) ?? null;
}

/** Ladder row first, then up to the top, then down to the bottom (`page.py` L50). */
function ladderOrder(rows: readonly RowInfo[], ladderRow: number): RowInfo[] {
  const filled = rows.filter((x) => x.count > 0);
  return [
    ...filled.filter((x) => x.r <= ladderRow).reverse(),
    ...filled.filter((x) => x.r > ladderRow),
  ];
}

/**
 * Written guide for `ladderRow` (SPEC §4, R5, R6, R14, D3). Shaped rows get outer-edge notes;
 * panels do not. Rows with `needsExtraLadder` beads get `extraLadder` (R15); split rows `parts`. `status` may be passed precomputed for `ladderRow`.
 */
export function buildInstructions(
  p: Pattern,
  ladderRow: number,
  status: CellMask = beadStatus(p, ladderRow),
): Instructions {
  const rows = allRows(p);
  const numbers = rowNumbers(p);
  const notesFor = (row: RowInfo): RowNote[] => {
    if (row.r === ladderRow) return [{ kind: 'ladderStart' }];
    const s = status[row.r] as Uint8Array;
    const notes =
      p.mode === 'shaped'
        ? shapedRowNotes(row, rows[towardLadder(row.r, ladderRow)], s)
        : extraLadderNotes(s);
    const parts: RowNote[] =
      row.segments.length > 1 ? [{ kind: 'parts', count: row.segments.length }] : [];
    return [...notes, ...parts];
  };
  const order = ladderOrder(rows, ladderRow).map((row): RowInstruction => ({
    rowNumber: numbers[row.r] as number,
    count: row.count,
    segments: row.segments.map((s) => toRuns(s.colors)),
    notes: notesFor(row),
  }));
  const coords = beadCoords(p);
  return {
    ladderRow,
    order,
    loop: loopPoint(p),
    sizeMm: coords.length ? extentMm(coords, BEAD_TYPES[p.beadType]) : { width: 0, height: 0 },
    totalBeads: coords.length,
  };
}
