import { hexToRgb } from '../palette/color';
import type { RgbTuple } from '../palette/types';

/** Unmixed edge pixel: palette index and its coverage `t` against the background. */
export interface Unmixed {
  readonly label: number;
  readonly t: number;
}

/** Edge-pixel unmixing lookup, cached per 24-bit colour. */
export type UnmixFn = (r: number, g: number, b: number) => Unmixed | null;

/** Max RGB distance from the background→colour segment for a palette colour to fit. */
export const UNMIX_TOLERANCE = 16;

/**
 * Edge unmixing (R8): models an edge pixel `c` as `b + t(p − b)` for background `b` and palette
 * colour `p`, `t = clamp(dot(c − b, p − b) / |p − b|², 0, 1)`. Among colours whose segment lies
 * within `tol` of `c`, the one farthest from `b` wins (ties: lower index); `null` if none fits.
 */
export function makeUnmix(
  bg: RgbTuple,
  paletteHex: readonly string[],
  tol = UNMIX_TOLERANCE,
): UnmixFn {
  const pal = paletteHex.map(hexToRgb);
  const cache = new Map<number, Unmixed | null>();
  const solve = (c: RgbTuple): Unmixed | null => {
    let best: Unmixed | null = null;
    let bestLen = 0;
    pal.forEach((p, label) => {
      const v = [p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]] as const;
      const len2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
      if (len2 <= bestLen) return;
      const u = [c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]] as const;
      const t = Math.min(1, Math.max(0, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / len2));
      const d2 = (u[0] - t * v[0]) ** 2 + (u[1] - t * v[1]) ** 2 + (u[2] - t * v[2]) ** 2;
      if (d2 > tol * tol) return;
      best = { label, t };
      bestLen = len2;
    });
    return best;
  };
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) cache.set(key, (v = solve([r, g, b])));
    return v;
  };
}
