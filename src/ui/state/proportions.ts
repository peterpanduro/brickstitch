import { BEAD_TYPES, type BeadTypeId, type Rotation } from '../../core';

/** Inputs of {@link proportionalSize}; give exactly one of `width` / `height` as the driver. */
export interface ProportionInput {
  readonly imgW: number;
  readonly imgH: number;
  readonly rotation: Rotation;
  readonly beadType: BeadTypeId;
  readonly width?: number;
  readonly height?: number;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * Lattice size (width 2..80, height 1..120) that keeps the oriented image's aspect, from the
 * given `width` (or else `height`); bead width and row pitch come from the bead type. The whole
 * image is used, not the foreground bounding box.
 */
export function proportionalSize(i: ProportionInput): { width: number; height: number } {
  const swap = i.rotation === 90 || i.rotation === 270;
  const w = swap ? i.imgH : i.imgW;
  const h = swap ? i.imgW : i.imgH;
  const { widthMm, rowPitchMm } = BEAD_TYPES[i.beadType];
  if (i.width !== undefined || i.height === undefined) {
    const width = clamp(i.width ?? 2, 2, 80);
    return { width, height: clamp((width * widthMm * h) / (w * rowPitchMm), 1, 120) };
  }
  const height = clamp(i.height, 1, 120);
  return { width: clamp((height * rowPitchMm * w) / (h * widthMm), 2, 80), height };
}
