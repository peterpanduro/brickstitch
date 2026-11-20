import type { Mask, RgbaImage } from '../imaging/types';

/**
 * 3×3 per-channel median over foreground pixels only (R8). Background pixels never vote, so a
 * 1-px stroke on a keyed background survives; `protect`ed pixels (detail colours) are kept.
 * Even counts take the lower median. Alpha is copied unchanged.
 */
export function maskedMedian3(img: RgbaImage, mask: Mask, protect: Uint8Array): RgbaImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data);
  const win = new Uint8Array(9);
  const idx = new Int32Array(9);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask.data[p] || protect[p]) continue;
      let n = 0;
      let same = true;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!mask.data[q]) continue;
          idx[n++] = q;
          if (
            data[q * 4] !== data[p * 4] ||
            data[q * 4 + 1] !== data[p * 4 + 1] ||
            data[q * 4 + 2] !== data[p * 4 + 2]
          )
            same = false;
        }
      }
      if (same) continue;
      for (let c = 0; c < 3; c++) {
        for (let j = 0; j < n; j++) {
          const v = data[idx[j]! * 4 + c]!;
          let k = j;
          while (k > 0 && win[k - 1]! > v) {
            win[k] = win[k - 1]!;
            k--;
          }
          win[k] = v;
        }
        out[p * 4 + c] = win[(n - 1) >> 1]!;
      }
    }
  return { width: w, height: h, data: out };
}

/** Vote weight of a pixel sitting between two different colours (anti-alias blend, R8). */
export const BLEND_WEIGHT = 0.25;

/**
 * Per-pixel vote weights: {@link BLEND_WEIGHT} for a pixel whose two neighbours along some axis
 * differ from it and from each other (background counts as a colour), times the pixel's coverage.
 */
export function voteWeights(
  labels: Int16Array,
  cover: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? -1 : labels[y * w + x]!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const c = labels[p]!;
      if (c < 0) continue;
      const between = (a: number, b: number): boolean => a !== c && b !== c && a !== b;
      const blend = between(at(x - 1, y), at(x + 1, y)) || between(at(x, y - 1), at(x, y + 1));
      out[p] = (blend ? BLEND_WEIGHT : 1) * cover[p]!;
    }
  return out;
}
