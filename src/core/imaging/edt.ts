import type { Mask } from './types';

const INF = 1e20;

function transform1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k]!;
      s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
      if (s <= z[k]! && k > 0) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const p = v[k]!;
    d[q] = (q - p) * (q - p) + f[p]!;
  }
}

/**
 * Exact squared Euclidean distance from every pixel to the nearest set pixel
 * (Felzenszwalb-Huttenlocher). Infinity everywhere when the mask is empty.
 */
export function edt(mask: Mask): Float32Array {
  const { width: w, height: h, data } = mask;
  const out = new Float32Array(w * h);
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const v = new Int32Array(m);
  const z = new Float64Array(m + 1);
  const tmp = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = data[y * w + x] ? 0 : INF;
    transform1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) tmp[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = tmp[y * w + x]!;
    transform1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x]! >= INF / 2 ? Infinity : d[x]!;
  }
  return out;
}
