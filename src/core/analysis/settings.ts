import type { BeadTypeId } from '../geometry';
import type { ColorId } from '../palette/types';
import type { PatternMode } from '../pattern/types';

/** Foreground detection (SPEC §5.3, R20, R30); `auto` = alpha, borderKey or none. */
export type BackgroundMode = 'auto' | 'alpha' | 'borderKey' | 'threshold' | 'none';

/**
 * How the cropped motif is scaled into the lattice; `stretch` fills the margin box in both axes
 * (aspect ignored); `auto` = stretch for a full-bleed image (background `none`), else contain (R32).
 */
export type FitMode = 'auto' | 'contain' | 'width' | 'height' | 'stretch';

/** Fit mode after resolving `auto`. */
export type ResolvedFit = Exclude<FitMode, 'auto'>;

/** Clockwise source rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

/** Which target side is derived from the other and the image proportions; `null` = both manual. */
export type AutoSize = 'width' | 'height' | null;

/** Image analysis settings (SPEC §5.3 with D5: one `lineSensitivity` slider). */
export interface AnalysisSettings {
  /** Source rotation, applied after {@link AnalysisSettings.flipH} and before masking (R31). */
  readonly rotation: Rotation;
  /** Mirror the source left-right before rotating. */
  readonly flipH: boolean;
  /** Import dialog: derive this side of the target from the other (R34); not used by the pipeline. */
  readonly autoSize: AutoSize;
  readonly background: BackgroundMode;
  /** Luma threshold for `threshold` mode, 0..255. */
  readonly threshold: number;
  /** Foreground is lighter than `threshold` instead of darker. */
  readonly thresholdInvert: boolean;
  /** ΔE2000 tolerance of the border flood fill, 2..40. */
  readonly borderKeyTolerance: number;
  /** Empty beads around the motif, 0..5; `auto` = panel 1, shaped 0. */
  readonly margin: number | 'auto';
  readonly fit: FitMode;
  /** Samples per bead axis, 4..8. */
  readonly supersample: number;
  /** Minimum foreground fraction for a bead, 0.3..0.7. */
  readonly coverage: number;
  /** 0..1; derives `minLineWidthBeads` and `detailThreshold` (see {@link lineParams}). */
  readonly lineSensitivity: number;
  /**
   * 0..1: also keep and thicken thin strokes of every colour but the dominant one (R42); 0 = off.
   * Strokes at least `(1 − details) · minLineWidthPx / 2` wide are kept.
   */
  readonly details: number;
  /** Colours in the result, 2..8 (panel background included). */
  readonly maxColors: number;
  readonly despeckle: boolean;
  /** Detect ring strokes in the source and replace them with optimiser rings (R37). */
  readonly fixRings: boolean;
  /** Shaped only: remove `floating` beads against the auto ladder. */
  readonly autoPrune: boolean;
  /** Panel fill; `auto` = most common palette colour among background pixels. */
  readonly panelBackground: ColorId | 'auto';
}

/** Defaults per SPEC §5.3 / D5. */
export const DEFAULT_SETTINGS: AnalysisSettings = {
  rotation: 0,
  flipH: false,
  autoSize: null,
  background: 'auto',
  threshold: 128,
  thresholdInvert: false,
  borderKeyTolerance: 12,
  margin: 'auto',
  fit: 'auto',
  supersample: 6,
  coverage: 0.5,
  lineSensitivity: 0.5,
  details: 0,
  maxColors: 4,
  despeckle: true,
  fixRings: true,
  autoPrune: true,
  panelBackground: 'auto',
};

/** Lattice to analyse into. */
export interface AnalysisTarget {
  readonly beadType: BeadTypeId;
  readonly mode: PatternMode;
  readonly width: number;
  readonly height: number;
}

/** Values derived from `lineSensitivity` (D5). */
export interface LineParams {
  /** Minimum stroke width in beads, 0 (off) .. 2.5; applied per colour mask. */
  readonly minLineWidthBeads: number;
  /** Detail colour wins a bead at this sample fraction, 0.5 .. 0.15. */
  readonly detailThreshold: number;
}

/** Maps line sensitivity (clamped to 0..1) linearly to {@link LineParams}. */
export function lineParams(sensitivity: number): LineParams {
  const s = Math.min(1, Math.max(0, sensitivity));
  return { minLineWidthBeads: 2.5 * s, detailThreshold: 0.5 * (1 - s) + 0.15 * s };
}

/** Resolved fit: `auto` stretches a full-bleed image (background `none`), else contains (R32). */
export const resolveFit = (fit: FitMode, background: BackgroundMode): ResolvedFit =>
  fit !== 'auto' ? fit : background === 'none' ? 'stretch' : 'contain';

/** Resolved margin in beads; `auto` = panel 1, shaped 0, and 0 when stretching (R32). */
export const resolveMargin = (s: AnalysisSettings, mode: PatternMode, fit: ResolvedFit): number =>
  s.margin !== 'auto' ? s.margin : mode === 'panel' && fit !== 'stretch' ? 1 : 0;
