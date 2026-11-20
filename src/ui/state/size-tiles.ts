import { beadCount, rowNumbers, type Analysis, type Pattern } from '../../core';
import { motifSizeMm, type SizeMm } from './real-size';

/** "Ett örhänge" tiles (SPEC R46): beads, non-empty rows (R6) and motif size. */
export interface SizeTiles {
  readonly beads: number;
  readonly rows: number;
  readonly size: SizeMm;
}

/** {@link SizeTiles} of `p`; `a` must be the analysis of `p`. */
export function sizeTiles(p: Pattern, a: Analysis): SizeTiles {
  return {
    beads: beadCount(p),
    rows: rowNumbers(p).filter((n) => n !== null).length,
    size: motifSizeMm(p, a),
  };
}
