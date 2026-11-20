import type { DebugLayer, DebugTransform, LabelLayer } from '../../core';
import type { ActiveSlider } from './highlight';
import { sourceRectToOriented, type CropRect, type Orientation } from './crop';
import type { Translate } from './import-merge';

/** RGBA colours (premultiplication is left to the canvas). */
export type Rgba = readonly [number, number, number, number];
/** Checkerboard behind the processed image (removed background): square side in CSS px, two greys. */
export const CHECKER = { cssPx: 8, colours: ['#cfcfcf', '#efefef'] } as const;
/** Live highlight of the removed background while Edge tolerance / Threshold is dragged. */
export const BACKGROUND_TINT: Rgba = [236, 0, 140, 115];
export const ADDED_TINT: Rgba = [249, 115, 22, 230];
export const THIN_TINT: Rgba = [14, 165, 233, 240];
export const DETAILS_TINT: Rgba = [22, 163, 74, 235];

/**
 * Layer → oriented display px (the crop view's SVG units). The analysis runs on the oriented
 * crop, so this is the layer's own transform shifted by the crop's top-left on the oriented image.
 */
export function layerToDisplay(
  t: DebugTransform,
  crop: CropRect | null,
  o: Orientation,
): DebugTransform {
  const off = crop ? sourceRectToOriented(crop, o) : { x: 0, y: 0 };
  return { x0: off.x + t.x0, y0: off.y + t.y0, sx: t.sx, sy: t.sy };
}

/**
 * RGBA pixels of same-sized layers, each painted in its colour where set; later layers win.
 * @throws if the layers differ in size
 */
export function layerPixels(layers: readonly { layer: DebugLayer; rgba: Rgba }[]): {
  data: Uint8ClampedArray;
  w: number;
  h: number;
} {
  const w = layers[0]?.layer.w ?? 0;
  const h = layers[0]?.layer.h ?? 0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (const { layer, rgba } of layers) {
    if (layer.w !== w || layer.h !== h) throw new Error('layerPixels: size mismatch');
    for (let p = 0; p < layer.data.length; p++) if (layer.data[p]) data.set(rgba, p * 4);
  }
  return { data, w, h };
}

/** `#rrggbb` → opaque RGBA. */
const hexRgba = (hex: string): Rgba => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** RGBA pixels of a label layer: each palette index in its colour, background transparent. */
export function labelPixels(
  layer: LabelLayer,
  palette: readonly string[],
): { data: Uint8ClampedArray; w: number; h: number } {
  const colours = palette.map(hexRgba);
  const data = new Uint8ClampedArray(layer.w * layer.h * 4);
  for (let p = 0; p < layer.data.length; p++) {
    const c = colours[layer.data[p]!];
    if (c) data.set(c, p * 4);
  }
  return { data, w: layer.w, h: layer.h };
}

/**
 * Legend chip on the processed import picture (SPEC R53, R39 colours): what the active slider
 * highlight's colours mean; `null` without a highlight. `w` = minimum line width in beads,
 * already formatted for the locale.
 */
export function pictureLegend(
  highlight: ActiveSlider | null,
  t: Translate,
  w: string,
): string | null {
  if (highlight === 'edge') return t('wizard.legend.edge');
  if (highlight === 'details') return t('wizard.legend.details');
  if (highlight === 'lines') return t('wizard.legend.lines', { w });
  return null;
}
