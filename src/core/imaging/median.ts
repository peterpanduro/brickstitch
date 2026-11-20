import type { RgbaImage } from './types';

/** Per-channel 3x3 median with edge replication (anti-alias cleanup). */
export function median3(img: RgbaImage): RgbaImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const win = new Uint8Array(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const v = data[(yy * w + xx) * 4 + c]!;
            let k = n++;
            while (k > 0 && win[k - 1]! > v) {
              win[k] = win[k - 1]!;
              k--;
            }
            win[k] = v;
          }
        }
        out[(y * w + x) * 4 + c] = win[4]!;
      }
    }
  }
  return { width: w, height: h, data: out };
}
