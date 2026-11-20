import type { Lab, RgbTuple } from './types';

const WHITE = { x: 0.95047, y: 1, z: 1.08883 } as const;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

/** Parses `#rgb` or `#rrggbb` (case-insensitive) into 8-bit channels. */
export function hexToRgb(hex: string): RgbTuple {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const linear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const labF = (t: number): number => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** Converts 8-bit sRGB to CIELAB (D65 white point). */
export function rgbToLab([r, g, b]: RgbTuple): Lab {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;
  const fx = labF(x / WHITE.x);
  const fy = labF(y / WHITE.y);
  const fz = labF(z / WHITE.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Converts a hex colour to CIELAB. */
export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}
