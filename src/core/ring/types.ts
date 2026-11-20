import type { BeadTypeId, Coord } from '../geometry';

/** Score components of a ring cell set (SPEC R35); lower `total` is better. */
export interface RingScore {
  /** Beads with fewer than 2 ring neighbours. */
  readonly breaks: number;
  /** Beads with more than 2 ring neighbours. */
  readonly clumps: number;
  /** Beads without a left/right mirror bead within half a bead width. */
  readonly lrAsym: number;
  /** Beads without an up/down mirror bead within half a bead width. */
  readonly udAsym: number;
  /** |width − height| of the outer extent in mm. */
  readonly aspectMm: number;
  /** Standard deviation of bead-centre distances from the extent centre, mm. */
  readonly spreadMm: number;
  /** RMS over rows of outer half-width minus the extent ellipse's half-width, mm. */
  readonly contourMm: number;
  readonly beadCount: number;
  /** Outer width in beads, `(hmax − hmin)/2 + 1` (may be a half). */
  readonly widthBeads: number;
  readonly heightRows: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Longest run of adjacent beads in the top and bottom ring rows. */
  readonly topRun: number;
  readonly bottomRun: number;
  readonly total: number;
}

/** Candidate score: {@link RingScore} plus the target-width term (included in `total`). */
export interface RingCandidateScore extends RingScore {
  /** |widthBeads − target width in beads|. */
  readonly widthMissBeads: number;
}

/** Where the ring centre sits relative to its anchor bead. */
export interface RingCentre {
  /** `true`: centred on the anchor bead; `false`: half a bead right of it (between beads). */
  readonly onBead: boolean;
  /** `true`: on the anchor row; `false`: half a row below it (row boundary). */
  readonly onRow: boolean;
}

/** One ring found by {@link ringCandidates}. */
export interface RingCandidate {
  /** Ring cells relative to the anchor bead; every `(h − r)` is even. Sorted by r, then h. */
  readonly cells: readonly Coord[];
  readonly centre: RingCentre;
  readonly radiusMm: number;
  readonly thicknessMm: number;
  readonly score: RingCandidateScore;
}

/** Parameters for {@link ringCandidates}; give `targetWidthBeads` or `targetDiameterMm` (≥ 3 beads). */
export interface RingSearchParams {
  readonly beadType?: BeadTypeId;
  readonly targetWidthBeads?: number;
  readonly targetDiameterMm?: number;
  /** Thickness threshold range in mm, searched in 0.05 mm steps (default 0.55–0.9). */
  readonly thicknessMm?: { readonly min: number; readonly max: number };
  /** Centre kinds to search (non-empty). Omitted: all four. */
  readonly centres?: readonly RingCentre[];
  /** Integer ≥ 1, default 6. */
  readonly maxCandidates?: number;
}

/** Ring cells at an anchor: those on the lattice, and how many fell off it. */
export interface RingPlacement {
  readonly cells: readonly Coord[];
  readonly clipped: number;
}
