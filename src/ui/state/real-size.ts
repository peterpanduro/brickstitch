import { BEAD_TYPES, sceneShapes, type Analysis, type Pattern, type Scene } from '../../core';

/** Width × height in millimetres. */
export interface SizeMm {
  readonly width: number;
  readonly height: number;
}

/**
 * Real-size boxes (SPEC R49): usable area inside the card (desktop: the mockup's 236 px card
 * minus padding and borders = 204 px ≈ 54 mm); the phone sheet passes its own width.
 */
export const REAL_SIZE_BOX: Readonly<Record<'desktop' | 'tablet', SizeMm>> = {
  desktop: { width: 54, height: 70 },
  tablet: { width: 40, height: 60 },
};

/** Space between the two copies of the pair. */
export const PAIR_GAP_MM = 6;

/** How the real-size pair fits its box: both copies, one copy, or none ("För stort"). */
export type PairLayout = 'pair' | 'single' | 'none';

/** {@link PairLayout} for a drawing of `size` in `box` (copies {@link PAIR_GAP_MM} apart). */
export function pairLayout(size: SizeMm, box: SizeMm): PairLayout {
  if (size.height > box.height || size.width > box.width) return 'none';
  return 2 * size.width + PAIR_GAP_MM <= box.width ? 'pair' : 'single';
}

/** Motif size (SPEC R46): the instructions' `sizeMm`, or the canvas size for an empty pattern. */
export function motifSizeMm(p: Pattern, a: Analysis): SizeMm {
  if (a.instructions) return a.instructions.sizeMm;
  const t = BEAD_TYPES[p.beadType];
  return { width: p.width * t.widthMm, height: p.height * t.rowPitchMm };
}

/** Scene-mm bounds of the beads and loop of `scene` (the pair's viewBox); `null` without beads. */
export function motifBox(
  scene: Scene,
): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let beads = 0;
  const add = (ax: number, ay: number, bx: number, by: number): void => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  for (const s of sceneShapes(scene)) {
    if (s.t === 'bead') {
      beads++;
      add(s.xMm, s.yMm, s.xMm + s.wMm, s.yMm + s.hMm);
    } else if (s.t === 'circle') add(s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r);
  }
  return beads === 0 ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * {@link PairLayout} of the drawn copies of `scene` (beads and loop, {@link motifBox}) in `box`;
 * `null` when the scene has no beads.
 */
export function drawnLayout(scene: Scene, box: SizeMm): PairLayout | null {
  const b = motifBox(scene);
  return b ? pairLayout(b, box) : null;
}
