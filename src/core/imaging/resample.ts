import type { RgbaImage } from './types';

/** Nearest-neighbour resample. */
export function resampleNearest(img: RgbaImage, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      const s = (sy * img.width + sx) * 4;
      const d = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = img.data[s + c]!;
    }
  }
  return { width, height, data: out };
}

/**
 * Area-weighted (box) resample with alpha-premultiplied averaging. Exact for
 * downscaling; behaves like nearest when upscaling.
 */
export function resampleBox(img: RgbaImage, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let j = Math.floor(y0); j < Math.min(img.height, Math.ceil(y1)); j++) {
        const wy = Math.min(j + 1, y1) - Math.max(j, y0);
        for (let i = Math.floor(x0); i < Math.min(img.width, Math.ceil(x1)); i++) {
          const w = wy * (Math.min(i + 1, x1) - Math.max(i, x0));
          const s = (j * img.width + i) * 4;
          const wa = (w * img.data[s + 3]!) / 255;
          r += wa * img.data[s]!;
          g += wa * img.data[s + 1]!;
          b += wa * img.data[s + 2]!;
          a += wa;
          wsum += w;
        }
      }
      const d = (y * width + x) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
      }
      out[d + 3] = wsum > 0 ? Math.round((a / wsum) * 255) : 0;
    }
  }
  return { width, height, data: out };
}
