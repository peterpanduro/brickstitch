import type { BeadTypeId } from '../geometry';
import type { ColorId, PaletteEntry } from '../palette/types';

export type { ColorId };

/** `panel`: every cell filled; `shaped`: cells may be `null`. */
export type PatternMode = 'panel' | 'shaped';

/** Ladder row selection: automatic (SPEC §3.2) or a fixed 0-based row. */
export type LadderChoice = { kind: 'auto' } | { kind: 'manual'; row: number };

/**
 * A brick stitch pattern on the canonical lattice (SPEC §2.3).
 * `cells[r]` has `width` entries for even `r` and `width - 1` for odd `r`.
 */
export interface Pattern {
  readonly title: string;
  readonly description: string;
  readonly beadType: BeadTypeId;
  readonly mode: PatternMode;
  /** Beads in wide rows, 2..80. */
  readonly width: number;
  /** Rows, 1..120. */
  readonly height: number;
  readonly palette: readonly PaletteEntry[];
  readonly cells: readonly (readonly (ColorId | null)[])[];
  readonly ladder: LadderChoice;
}

/** A maximal run of adjacent beads in one row, as doubled `h` bounds. */
export interface RowSegment {
  readonly hStart: number;
  readonly hEnd: number;
  readonly colors: readonly ColorId[];
}

/** Per-row summary: segments, bead count and outer edge extents. */
export interface RowInfo {
  readonly r: number;
  readonly segments: readonly RowSegment[];
  readonly count: number;
  readonly left?: number;
  readonly right?: number;
}
