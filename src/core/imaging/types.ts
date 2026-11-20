import type { RgbTuple } from '../palette/types';

export type { RgbTuple };

/** Straight-alpha RGBA raster, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Binary raster, one byte per pixel (0 or 1), row-major. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Colour distance; implementations must not retain the argument tuples. */
export type ColorDistance = (a: RgbTuple, b: RgbTuple) => number;

/** Pixel rectangle. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
