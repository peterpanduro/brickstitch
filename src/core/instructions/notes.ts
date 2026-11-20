import { hOf } from '../geometry';
import { BEAD_STATUS } from '../feasibility/support';
import type { RowInfo } from '../pattern/types';
import type { RowNote } from './types';

/**
 * Edge note for an outer-edge delta `d` in h-units (SPEC §3.4): `d = -1` is a normal row,
 * `d >= 1` increases `(d + 1) / 2`, `d <= -3` steps in `(-d - 1) / 2` extra.
 */
export function edgeNote(side: 'left' | 'right', d: number): RowNote[] {
  if (d >= 1) return [{ kind: 'increase', side, count: (d + 1) / 2 }];
  if (d <= -3) return [{ kind: 'stepIn', side, count: (-d - 1) / 2 }];
  return [];
}

/** Outer-edge notes (D3) for `row` against its neighbour `toward` the ladder. */
export function edgeNotes(row: RowInfo, toward: RowInfo | undefined): RowNote[] {
  if (row.left === undefined || row.right === undefined) return [];
  if (toward?.left === undefined || toward.right === undefined) return [];
  return [
    ...edgeNote('left', toward.left - row.left),
    ...edgeNote('right', row.right - toward.right),
  ];
}

type ExtraLadderNote = Extract<RowNote, { kind: 'extraLadder' }>;

const supportedRange = (status: Uint8Array): [number, number] => {
  const sup = [...status.keys()].filter((i) => status[i] === BEAD_STATUS.supported);
  return [Math.min(...sup), Math.max(...sup)];
};

/**
 * Row notes for a shaped row (SPEC §3.4, R15): outer-edge notes plus `extraLadder` notes. On a
 * side with extra-ladder beads the increase becomes `increase 1` when a supported bead steps out
 * past `toward` on that side, and is dropped otherwise.
 */
export function shapedRowNotes(
  row: RowInfo,
  toward: RowInfo | undefined,
  status: Uint8Array,
): RowNote[] {
  const extra = extraLadderNotes(status);
  const [lo, hi] = supportedRange(status).map((i) => hOf(row.r, i)) as [number, number];
  const stepsOut = {
    left: lo < (toward?.left ?? -Infinity),
    right: hi > (toward?.right ?? Infinity),
  };
  const edges = edgeNotes(row, toward).flatMap((n): RowNote[] => {
    if (n.kind !== 'increase' || !extra.some((x) => x.side === n.side)) return [n];
    return stepsOut[n.side] ? [{ ...n, count: 1 }] : [];
  });
  return [...edges, ...extra];
}

/**
 * `extraLadder` notes for one row's bead statuses, at most one per side (left, right, inner),
 * relative to the row's supported beads. `count` is the number of `needsExtraLadder` beads on
 * that side (k − 1 for an outer increase of k). With no supported bead in the row, all are `left`.
 */
export function extraLadderNotes(status: Uint8Array): ExtraLadderNote[] {
  const [lo, hi] = supportedRange(status);
  const counts = { left: 0, right: 0, inner: 0 };
  status.forEach((s, i) => {
    if (s === BEAD_STATUS.extraLadder) counts[i < lo ? 'left' : i > hi ? 'right' : 'inner']++;
  });
  return (['left', 'right', 'inner'] as const)
    .filter((side) => counts[side] > 0)
    .map((side) => ({ kind: 'extraLadder', side, count: counts[side] }));
}
