import { BEAD_TYPES, rowLength, type BeadTypeId } from '../geometry';
import type { Fit } from './fit';

/** Colour index per bead (`-1` = empty); `cells[r]` has the canonical row length. */
export type IndexGrid = number[][];

/** Input of {@link rasterise}. */
export interface RasteriseInput {
  /** Colour index per pixel (palette order), `-1` = background. */
  readonly labels: Int16Array;
  /** Foreground coverage per pixel, 0..1. */
  readonly cover: Float32Array;
  /** Vote weight per pixel (coverage × anti-alias blend weight, R8). */
  readonly weights: Float32Array;
  readonly imgW: number;
  readonly imgH: number;
  readonly fit: Fit;
  readonly beadType: BeadTypeId;
  readonly width: number;
  readonly height: number;
  readonly supersample: number;
  readonly coverage: number;
  readonly detailThreshold: number;
  /** Detail flag per colour index. */
  readonly detail: readonly boolean[];
}

/**
 * Per-bead supersampling (SPEC §5.4, `ripa4/gen.py:build`, centred samples per R10): beads whose
 * coverage-weighted foreground fraction is `< coverage` stay empty; otherwise the first detail
 * colour (index order) whose weighted votes reach `detailThreshold · ss²` wins, else the
 * weighted majority (ties: lower index).
 */
export function rasterise(o: RasteriseInput): IndexGrid {
  const { widthMm: bw, rowPitchMm: bh } = BEAD_TYPES[o.beadType];
  const { labels, cover, weights, imgW, imgH, fit, detail } = o;
  const ss = o.supersample;
  const n2 = ss * ss;
  const votes = new Float64Array(detail.length);
  const inv = 1 / fit.mmPerPx;
  const invY = 1 / fit.mmPerPxY;
  const cells: IndexGrid = [];
  for (let r = 0; r < o.height; r++) {
    const row: number[] = [];
    if (imgW === 0 || imgH === 0) {
      cells.push(Array<number>(rowLength(o.width, r)).fill(-1));
      continue;
    }
    const top = r * bh;
    for (let i = 0; i < rowLength(o.width, r); i++) {
      const left = i * bw + (r & 1) * (bw / 2);
      votes.fill(0);
      let fg = 0;
      for (let b = 0; b < ss; b++) {
        const Y = Math.floor((top + ((b + 0.5) / ss) * bh - fit.oy) * invY);
        if (Y < 0 || Y >= imgH) continue;
        for (let a = 0; a < ss; a++) {
          const X = Math.floor((left + ((a + 0.5) / ss) * bw - fit.ox) * inv);
          if (X < 0 || X >= imgW) continue;
          const p = Y * imgW + X;
          const k = labels[p]!;
          if (k < 0) continue;
          fg += cover[p]!;
          votes[k] = votes[k]! + weights[p]!;
        }
      }
      row.push(fg / n2 < o.coverage ? -1 : pick(votes, detail, o.detailThreshold * n2));
    }
    cells.push(row);
  }
  return cells;
}

function pick(votes: Float64Array, detail: readonly boolean[], detailMin: number): number {
  for (let k = 0; k < votes.length; k++) if (detail[k] && votes[k]! >= detailMin) return k;
  let best = -1;
  let bestV = 0;
  for (let k = 0; k < votes.length; k++)
    if (votes[k]! > bestV) {
      bestV = votes[k]!;
      best = k;
    }
  return best;
}
