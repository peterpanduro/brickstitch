import type { Mask } from './types';

interface Part {
  readonly start: number;
  size: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Visits the 8-connected component of `start` in `data`, calling `visit` on each pixel. */
function walk(
  data: Uint8Array,
  w: number,
  h: number,
  start: number,
  stack: Int32Array,
  seen: Uint8Array,
  visit: (p: number, x: number, y: number) => void,
): void {
  let sp = 0;
  seen[start] = 1;
  stack[sp++] = start;
  while (sp > 0) {
    const p = stack[--sp]!;
    const x = p % w;
    const y = (p - x) / w;
    visit(p, x, y);
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = ny * w + nx;
        if (data[q] && !seen[q]) {
          seen[q] = 1;
          stack[sp++] = q;
        }
      }
    }
  }
}

/**
 * Copy of `mask` without the 8-connected components smaller than both `ratio` times the largest
 * one and, when `beads` > 0, one bead (the largest component's bounding box area divided by
 * `beads`): stray specks that would enlarge the motif's bounding box, but not a small real part
 * (a detached dot or moon) that still fills a bead.
 */
export function removeSpecks(mask: Mask, ratio: number, beads = 0): Mask {
  const { width: w, height: h, data } = mask;
  const out: Mask = { width: w, height: h, data: data.slice() };
  const seen = new Uint8Array(w * h);
  let fg = 0;
  for (let p = 0; p < data.length; p++) fg += data[p]!;
  const stack = new Int32Array(fg);
  const parts: Part[] = [];
  let largest: Part | null = null;
  for (let s = 0; s < data.length; s++) {
    if (!data[s] || seen[s]) continue;
    const part: Part = { start: s, size: 0, x0: w, y0: h, x1: -1, y1: -1 };
    walk(data, w, h, s, stack, seen, (_, x, y) => {
      part.size++;
      if (x < part.x0) part.x0 = x;
      if (x > part.x1) part.x1 = x;
      if (y < part.y0) part.y0 = y;
      if (y > part.y1) part.y1 = y;
    });
    parts.push(part);
    if (!largest || part.size > largest.size) largest = part;
  }
  if (!largest) return out;
  let limit = ratio * largest.size;
  if (beads > 0)
    limit = Math.min(
      limit,
      ((largest.x1 - largest.x0 + 1) * (largest.y1 - largest.y0 + 1)) / beads,
    );
  seen.fill(0);
  for (const part of parts)
    if (part.size < limit)
      walk(data, w, h, part.start, stack, seen, (p) => {
        out.data[p] = 0;
      });
  return out;
}
