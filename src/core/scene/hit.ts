import { BEAD_TYPES, hOf, rowLength, type Coord } from '../geometry';
import type { Pattern } from '../pattern/types';

/**
 * Lattice cell under a point in lattice-local millimetres (origin = lattice top-left, see
 * `Scene.origin`), in O(1). Whole cells count, gaps included; `null` off the lattice.
 */
export function hitTest(p: Pattern, xMm: number, yMm: number): Coord | null {
  const t = BEAD_TYPES[p.beadType];
  const r = Math.floor(yMm / t.rowPitchMm);
  if (r < 0 || r >= p.height) return null;
  const i = Math.floor((xMm - ((r & 1) * t.widthMm) / 2) / t.widthMm);
  return i >= 0 && i < rowLength(p.width, r) ? { r, h: hOf(r, i) } : null;
}

/**
 * Distinct lattice cells under the segment `a → b` (lattice-local mm), in order, sampled at a
 * quarter of the smaller bead dimension so fast pointer moves leave no gaps.
 */
export function cellsAlong(
  p: Pattern,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): Coord[] {
  const t = BEAD_TYPES[p.beadType];
  const step = Math.min(t.widthMm, t.rowPitchMm) / 4;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  const out: Coord[] = [];
  for (let k = 0; k <= n; k++) {
    const c = hitTest(p, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    if (c && !out.some((o) => o.r === c.r && o.h === c.h)) out.push(c);
  }
  return out;
}
