import { hexToLab } from '../../core';

/** Picker filter chips, in display order (SPEC R47). */
export const COLOUR_FAMILIES = ['grey', 'red', 'yellow', 'green', 'blue', 'brown'] as const;

/** A colour family of the add-colour picker. */
export type ColourFamily = (typeof COLOUR_FAMILIES)[number];

/**
 * Family of `hex` from CIELAB: chroma below 12 is white/grey; muted warm hues and dark oranges are brown/beige (dark saturated reds stay red);
 * the rest fall into hue buckets (red/pink, yellow/orange, green, blue/purple).
 */
export function colourFamily(hex: string): ColourFamily {
  const { L, a, b } = hexToLab(hex);
  const chroma = Math.hypot(a, b);
  if (chroma < 12) return 'grey';
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const warm = h >= 25 && h < 100;
  if (warm && (chroma < 38 || (L < 45 && h >= 48))) return 'brown';
  if (h < 48 || h >= 330) return 'red';
  if (h < 105) return 'yellow';
  if (h < 190) return 'green';
  return 'blue';
}
