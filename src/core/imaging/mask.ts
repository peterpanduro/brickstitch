import type { Mask } from './types';

/** Creates an all-zero mask. */
export function createMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

/** Number of set pixels. */
export function maskCount(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i]!;
  return n;
}

/** Complement of a mask. */
export function invert(mask: Mask): Mask {
  const out = createMask(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) out.data[i] = mask.data[i]! ^ 1;
  return out;
}

/** Pixelwise OR of two equally sized masks. */
export function union(a: Mask, b: Mask): Mask {
  if (a.width !== b.width || a.height !== b.height) throw new Error('mask size mismatch');
  const out = createMask(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i]! | b.data[i]!;
  return out;
}
