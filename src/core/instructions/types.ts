import type { ColorId, PaletteEntry } from '../palette/types';

/**
 * Row annotation; the ladder row only carries `ladderStart`. `extraLadder` marks `count`
 * `needsExtraLadder` beads (SPEC R1) beyond the row's supported beads on one `side`, or `inner`
 * when they bridge a gap between supported beads; it replaces the `increase` note on that side.
 */
export type RowNote =
  | { readonly kind: 'ladderStart' }
  | { readonly kind: 'increase'; readonly side: 'left' | 'right'; readonly count: number }
  | { readonly kind: 'stepIn'; readonly side: 'left' | 'right'; readonly count: number }
  | {
      readonly kind: 'extraLadder';
      readonly side: 'left' | 'right' | 'inner';
      readonly count: number;
    }
  | { readonly kind: 'parts'; readonly count: number };

/** `length` consecutive beads of one colour. */
export interface Run {
  readonly color: ColorId;
  readonly length: number;
}

/** One row of the written guide. `rowNumber` is 1-based from the topmost non-empty row (R6). */
export interface RowInstruction {
  readonly rowNumber: number;
  readonly count: number;
  readonly segments: readonly (readonly Run[])[];
  readonly notes: readonly RowNote[];
}

/** Complete written guide. `order` is ladder, ladder-1 … 1, ladder+1 … H. */
export interface Instructions {
  readonly ladderRow: number;
  readonly order: readonly RowInstruction[];
  readonly loop: { readonly r: number; readonly h: number } | null;
  readonly sizeMm: { readonly width: number; readonly height: number };
  readonly totalBeads: number;
}

/** Bead table row; colours with zero beads are omitted. */
export interface BeadCountRow {
  readonly color: PaletteEntry;
  readonly perEarring: number;
  readonly perPair: number;
}
