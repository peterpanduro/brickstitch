import type { RgbaImage } from '../core';
import { scaledSize } from './state/file';

/** Long side limit applied before analysis (SPEC R19). */
export const MAX_SIDE = 2048;

/**
 * Decodes an image file (EXIF orientation applied) to straight RGBA, scaled down so the long
 * side is at most {@link MAX_SIDE}.
 * @throws if the browser cannot decode the file.
 */
export async function decodeImage(file: Blob): Promise<RgbaImage> {
  const opts = { imageOrientation: 'from-image' } as const;
  let bmp = await createImageBitmap(file, opts);
  if (Math.max(bmp.width, bmp.height) > MAX_SIDE) {
    const { width, height } = scaledSize(bmp.width, bmp.height, MAX_SIDE);
    bmp.close();
    bmp = await createImageBitmap(file, {
      ...opts,
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    });
  }
  try {
    const { width, height } = scaledSize(bmp.width, bmp.height, MAX_SIDE);
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { width, height, data };
  } finally {
    bmp.close();
  }
}
