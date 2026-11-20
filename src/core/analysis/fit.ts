import { BEAD_TYPES, type BeadTypeId } from '../geometry';
import type { ResolvedFit } from './settings';

/** Image placement on the lattice: lattice mm = `(o + px · scale)` per axis. */
export interface Fit {
  /** Horizontal scale (also the vertical one unless stretching). */
  readonly mmPerPx: number;
  readonly mmPerPxY: number;
  readonly ox: number;
  readonly oy: number;
}

/** Lattice size for {@link computeFit}. */
export interface FitTarget {
  readonly beadType: BeadTypeId;
  readonly width: number;
  readonly height: number;
}

/**
 * Fits a `imgW × imgH` px image into the margin box `(W − 2m)·bw × (H − 2m)·bh` (SPEC §5.4,
 * `sol2/ras.py:build`) and centres it; `stretch` scales each axis to the box (R32). Lattice x runs from the left edge of the first wide-row
 * bead (width `W·bw`), y from the top edge of row 0.
 */
export function computeFit(
  imgW: number,
  imgH: number,
  t: FitTarget,
  margin: number,
  mode: ResolvedFit,
): Fit {
  const { widthMm: bw, rowPitchMm: bh } = BEAD_TYPES[t.beadType];
  const boxW = Math.max(0, t.width - 2 * margin) * bw;
  const boxH = Math.max(0, t.height - 2 * margin) * bh;
  const sw = boxW / imgW;
  const sh = boxH / imgH;
  const mmPerPx =
    mode === 'width' || mode === 'stretch' ? sw : mode === 'height' ? sh : Math.min(sw, sh);
  const mmPerPxY = mode === 'stretch' ? sh : mmPerPx;
  return {
    mmPerPx,
    mmPerPxY,
    ox: (t.width * bw - imgW * mmPerPx) / 2,
    oy: (t.height * bh - imgH * mmPerPxY) / 2,
  };
}
