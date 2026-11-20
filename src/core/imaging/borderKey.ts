import { createMask } from './mask';
import type { ColorDistance, Mask, RgbTuple, RgbaImage } from './types';

const medianOf = (values: number[]): number =>
  values.sort((a, b) => a - b)[values.length >> 1] ?? 0;

/** Bits dropped per channel when binning border colours. */
const QUANT_SHIFT = 4;

/** Pixel indices of the image border, each once, clockwise from the top-left. */
function borderPixels(w: number, h: number): number[] {
  if (w === 0 || h === 0) return [];
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(x);
  for (let y = 1; y < h; y++) out.push(y * w + w - 1);
  if (h > 1) for (let x = w - 2; x >= 0; x--) out.push((h - 1) * w + x);
  if (w > 1) for (let y = h - 2; y > 0; y--) out.push(y * w);
  return out;
}

/**
 * Dominant border colour: the per-channel median of the border pixels in the most common
 * quantised (4 bits per channel) border colour bin; ties go to the bin seen first.
 * `null` for an empty image.
 */
export function dominantBorderColour(img: RgbaImage): RgbTuple | null {
  const { width: w, height: h, data } = img;
  const bins = new Map<number, number[]>();
  let best: number[] = [];
  for (const p of borderPixels(w, h)) {
    const i = p * 4;
    const key =
      ((data[i]! >> QUANT_SHIFT) << 8) |
      ((data[i + 1]! >> QUANT_SHIFT) << 4) |
      (data[i + 2]! >> QUANT_SHIFT);
    let bin = bins.get(key);
    if (!bin) bins.set(key, (bin = []));
    bin.push(i);
    if (bin.length > best.length) best = bin;
  }
  if (best.length === 0) return null;
  const ch = (c: number): number => medianOf(best.map((i) => data[i + c]!));
  return [ch(0), ch(1), ch(2)];
}

/** Share (0..1) of border pixels within `tolerance` of `seed`; 0 for an empty image. */
export function borderShare(
  img: RgbaImage,
  seed: RgbTuple,
  distance: ColorDistance,
  tolerance: number,
): number {
  const border = borderPixels(img.width, img.height);
  const near = memoNear(img, seed, distance, tolerance);
  let n = 0;
  for (const p of border) if (near(p)) n++;
  return border.length ? n / border.length : 0;
}

function memoNear(
  img: RgbaImage,
  seed: RgbTuple,
  distance: ColorDistance,
  tolerance: number,
): (p: number) => boolean {
  const { data } = img;
  const px: [number, number, number] = [0, 0, 0];
  const memo = new Map<number, boolean>();
  return (p) => {
    const key = (data[p * 4]! << 16) | (data[p * 4 + 1]! << 8) | data[p * 4 + 2]!;
    let v = memo.get(key);
    if (v === undefined) {
      px[0] = data[p * 4]!;
      px[1] = data[p * 4 + 1]!;
      px[2] = data[p * 4 + 2]!;
      memo.set(key, (v = distance(px, seed) <= tolerance));
    }
    return v;
  };
}

/**
 * Foreground = pixels NOT reachable (4-connected) from the border through
 * pixels within `tolerance` of `seed` (default: {@link dominantBorderColour}). Enclosed regions
 * of background colour therefore stay foreground.
 * @param distance colour distance; called once per distinct pixel colour with a reused scratch
 * tuple.
 */
export function borderKeyMask(
  img: RgbaImage,
  distance: ColorDistance,
  tolerance: number,
  seed: RgbTuple | null = dominantBorderColour(img),
): Mask {
  const { width: w, height: h } = img;
  const fg = createMask(w, h);
  fg.data.fill(1);
  if (w === 0 || h === 0 || !seed) return fg;
  const near = memoNear(img, seed, distance, tolerance);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const push = (p: number): void => {
    if (fg.data[p] !== 1 || !near(p)) return;
    fg.data[p] = 0;
    stack[sp++] = p;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp]!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  return fg;
}
