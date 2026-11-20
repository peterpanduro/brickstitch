import { BEAD_TYPES, type BeadType } from '../geometry';
import type { Pattern } from '../pattern/types';
import type { SceneOptions } from './types';

const FILL_W = 0.9;
const FILL_H = 0.88;
const PAD = 0.4;

/** Scene geometry derived from a pattern and the enabled layers. */
export interface SceneLayout {
  readonly t: BeadType;
  readonly textSize: number;
  readonly pad: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly gutterLeft: number;
  readonly latticeWidth: number;
  readonly width: number;
  readonly height: number;
}

/** Computes gutters, origin and total size in millimetres. */
export function sceneLayout(p: Pattern, o: SceneOptions): SceneLayout {
  const t = BEAD_TYPES[p.beadType];
  const textSize = t.rowPitchMm * 0.7;
  const left = (o.rowNumbers ? textSize * 1.9 : 0) + (o.ladder ? textSize * 1.3 : 0);
  const right = (o.counts ? textSize * 2 : 0) + (o.warnings ? textSize * 3 : 0);
  const gutterLeft = left > 0 ? left + 2 * PAD : 0;
  const gutterRight = right > 0 ? right + 2 * PAD : 0;
  const top = o.loop ? t.rowPitchMm : 0;
  const latticeWidth = p.width * t.widthMm;
  return {
    t,
    textSize,
    pad: PAD,
    origin: { x: gutterLeft, y: top },
    gutterLeft,
    latticeWidth,
    width: gutterLeft + latticeWidth + gutterRight,
    height: top + p.height * t.rowPitchMm,
  };
}

/** Top-left and size of the bead drawn at `(r, h)`: centred in its cell with a small gap. */
export function beadRect(
  l: Pick<SceneLayout, 't' | 'origin'>,
  r: number,
  h: number,
): { xMm: number; yMm: number; wMm: number; hMm: number } {
  const wMm = l.t.widthMm * FILL_W;
  const hMm = l.t.rowPitchMm * FILL_H;
  return {
    xMm: l.origin.x + (h * l.t.widthMm) / 2 + (l.t.widthMm - wMm) / 2,
    yMm: l.origin.y + r * l.t.rowPitchMm + (l.t.rowPitchMm - hMm) / 2,
    wMm,
    hMm,
  };
}
