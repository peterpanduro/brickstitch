import { createMask } from './mask';
import type { Mask, RgbaImage } from './types';

/** Foreground = pixels with alpha >= `minAlpha`. */
export function alphaMask(img: RgbaImage, minAlpha = 250): Mask {
  const out = createMask(img.width, img.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = img.data[i * 4 + 3]! >= minAlpha ? 1 : 0;
  return out;
}

/** True when any pixel has alpha below `minAlpha`. */
export function hasTransparency(img: RgbaImage, minAlpha = 250): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < minAlpha) return true;
  return false;
}

/** Rec. 601 luma threshold; foreground is darker than `t` unless `invert`. */
export function thresholdMask(img: RgbaImage, t = 128, invert = false): Mask {
  const out = createMask(img.width, img.height);
  for (let i = 0; i < out.data.length; i++) {
    const luma =
      0.299 * img.data[i * 4]! + 0.587 * img.data[i * 4 + 1]! + 0.114 * img.data[i * 4 + 2]!;
    out.data[i] = luma < t !== invert ? 1 : 0;
  }
  return out;
}
