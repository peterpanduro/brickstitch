import type { RgbaImage } from './types';

/** Clockwise quarter turns. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/** Copy of `img` with each output pixel `(x, y)` taken from source `src(x, y)`. */
function remap(
  img: RgbaImage,
  width: number,
  height: number,
  src: (x: number, y: number) => number,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = src(x, y) * 4;
      data.set(img.data.subarray(i, i + 4), (y * width + x) * 4);
    }
  return { width, height, data };
}

/** `img` rotated clockwise by `quarterTurns` × 90°; width and height swap at 1 and 3. */
export function rotateImage(img: RgbaImage, quarterTurns: QuarterTurns): RgbaImage {
  const { width: w, height: h } = img;
  switch (quarterTurns) {
    case 0:
      return img;
    case 1:
      return remap(img, h, w, (x, y) => (h - 1 - x) * w + y);
    case 2:
      return remap(img, w, h, (x, y) => (h - 1 - y) * w + (w - 1 - x));
    case 3:
      return remap(img, h, w, (x, y) => x * w + (w - 1 - y));
  }
}

/** `img` mirrored left-right (`h`) or top-bottom (`v`). */
export function flipImage(img: RgbaImage, axis: 'h' | 'v'): RgbaImage {
  const { width: w, height: h } = img;
  return axis === 'h'
    ? remap(img, w, h, (x, y) => y * w + (w - 1 - x))
    : remap(img, w, h, (x, y) => (h - 1 - y) * w + x);
}
