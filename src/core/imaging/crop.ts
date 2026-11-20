import { createMask } from './mask';
import type { Box, Mask, RgbaImage } from './types';

/** Tight bounding box of set pixels, or null for an empty mask. */
export function boundingBox(mask: Mask): Box | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Copies the `box` region of an image. */
export function cropImage(img: RgbaImage, box: Box): RgbaImage {
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const s = ((box.y + y) * img.width + box.x) * 4;
    data.set(img.data.subarray(s, s + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}

/** Copies the `box` region of a mask. */
export function cropMask(mask: Mask, box: Box): Mask {
  const out = createMask(box.width, box.height);
  for (let y = 0; y < box.height; y++) {
    const s = (box.y + y) * mask.width + box.x;
    out.data.set(mask.data.subarray(s, s + box.width), y * box.width);
  }
  return out;
}
