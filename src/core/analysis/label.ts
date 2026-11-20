import { boundingBox } from '../imaging/crop';
import { createMask } from '../imaging/mask';
import { resampleBox } from '../imaging/resample';
import type { Box, Mask, RgbaImage } from '../imaging/types';
import { maskedMedian3 } from './denoise';
import { cropPadded, type NearestFn } from './prepare';
import type { UnmixFn } from './unmix';

/** Working pixels per bead width (SPEC §5.2: 1 bead ≈ 12 px). */
export const WORKING_PX_PER_BEAD = 12;

/**
 * Downscale factor for the cropped motif: to {@link WORKING_PX_PER_BEAD} when it has more than
 * 1.5× that, else 1 (a slight downscale would only blur thin strokes).
 */
export const workingScale = (pxPerBead: number): number =>
  pxPerBead > 1.5 * WORKING_PX_PER_BEAD ? WORKING_PX_PER_BEAD / pxPerBead : 1;

/** Colour index per pixel (`-1` = background) and foreground coverage 0..1 per pixel. */
export interface LabelImage {
  readonly labels: Int16Array;
  readonly cover: Float32Array;
  readonly w: number;
  readonly h: number;
}

/**
 * Crops `box`, zeroes alpha outside `mask`, box-downscales by `k` (< 1) with premultiplied
 * averaging so background never tints foreground colours, and pads by `pad` px. The returned
 * mask is `alpha > 0`, so thin strokes survive the downscale with partial coverage.
 */
export function workingCrop(
  img: RgbaImage,
  mask: Mask,
  box: Box,
  k: number,
  pad: number,
): { img: RgbaImage; mask: Mask } {
  const c = cropPadded(img, mask, box, 0);
  for (let p = 0; p < c.mask.data.length; p++) if (!c.mask.data[p]) c.img.data[p * 4 + 3] = 0;
  const w = Math.max(1, Math.round(box.width * k));
  const h = Math.max(1, Math.round(box.height * k));
  const scaled = k < 1 ? resampleBox(c.img, w, h) : c.img;
  const m = createMask(scaled.width, scaled.height);
  for (let p = 0; p < m.data.length; p++) m.data[p] = scaled.data[p * 4 + 3]! > 0 ? 1 : 0;
  return cropPadded(scaled, m, { x: 0, y: 0, width: scaled.width, height: scaled.height }, pad);
}

/**
 * Masked median (detail-colour pixels protected), then nearest palette index per foreground
 * pixel with coverage `alpha / 255`. With `unmix`, a foreground pixel 4-adjacent to background
 * is unmixed against the background colour (label = fitted colour, coverage × t) unless a
 * non-edge foreground neighbour has the same nearest colour (keeps genuine flat regions). Also
 * returns the palette histogram.
 */
export function labelPixels(
  img: RgbaImage,
  mask: Mask,
  nearest: NearestFn,
  detail: readonly boolean[],
  unmix: UnmixFn | null = null,
): LabelImage & { hist: number[] } {
  const { width: w, height: h } = img;
  const n = mask.data.length;
  const d = img.data;
  const protect = new Uint8Array(n);
  if (detail.includes(true))
    for (let p = 0; p < n; p++)
      if (mask.data[p] && detail[nearest(d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!)]) protect[p] = 1;
  const den = maskedMedian3(img, mask, protect).data;
  const labels = new Int16Array(n).fill(-1);
  const cover = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    if (!mask.data[p]) continue;
    labels[p] = nearest(den[p * 4]!, den[p * 4 + 1]!, den[p * 4 + 2]!);
    cover[p] = d[p * 4 + 3]! / 255;
  }
  if (unmix) {
    const nb = (p: number): number[] => {
      const x = p % w;
      return [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        p >= w ? p - w : -1,
        p < n - w ? p + w : -1,
      ];
    };
    const edge = new Uint8Array(n);
    for (let p = 0; p < n; p++)
      if (mask.data[p] && nb(p).some((q) => q < 0 || !mask.data[q])) edge[p] = 1;
    const out = Int16Array.from(labels);
    for (let p = 0; p < n; p++) {
      if (!edge[p] || protect[p]) continue;
      if (nb(p).some((q) => q >= 0 && mask.data[q] && !edge[q] && labels[q] === labels[p]))
        continue;
      const u = unmix(den[p * 4]!, den[p * 4 + 1]!, den[p * 4 + 2]!);
      if (!u) continue;
      out[p] = u.label;
      cover[p] = cover[p]! * u.t;
    }
    labels.set(out);
  }
  const hist = new Array<number>(detail.length).fill(0);
  for (let p = 0; p < n; p++) if (labels[p]! >= 0) hist[labels[p]!]!++;
  return { labels, cover, hist, w, h };
}

/** A cropped label image and the offset of its top-left pixel in the uncropped one. */
export interface CroppedLabels extends LabelImage {
  readonly x0: number;
  readonly y0: number;
}

/** Bounding box of the labelled pixels, `null` when there are none. */
export function labelBox(l: LabelImage): Box | null {
  const m = createMask(l.w, l.h);
  for (let p = 0; p < l.labels.length; p++) m.data[p] = l.labels[p]! >= 0 ? 1 : 0;
  return boundingBox(m);
}

/** Crops a label image to the bounding box of its labelled pixels. */
export function cropLabels(l: LabelImage): CroppedLabels {
  const b = labelBox(l);
  if (!b || (b.width === l.w && b.height === l.h)) return { ...l, x0: 0, y0: 0 };
  return cropToBox(l, b);
}

/** Crops a label image to `box` (inside the image). */
export function cropToBox(l: LabelImage, b: Box): CroppedLabels {
  if (b.x === 0 && b.y === 0 && b.width === l.w && b.height === l.h) return { ...l, x0: 0, y0: 0 };
  const labels = new Int16Array(b.width * b.height);
  const cover = new Float32Array(b.width * b.height);
  for (let y = 0; y < b.height; y++) {
    const s = (b.y + y) * l.w + b.x;
    labels.set(l.labels.subarray(s, s + b.width), y * b.width);
    cover.set(l.cover.subarray(s, s + b.width), y * b.width);
  }
  return { labels, cover, w: b.width, h: b.height, x0: b.x, y0: b.y };
}
