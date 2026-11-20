import { createMask } from './mask';
import type { Mask } from './types';

/**
 * Copy of `mask` without the 8-connected components smaller than `ratio` times the largest one
 * (stray specks that would otherwise enlarge the motif's bounding box).
 */
export function removeSpecks(mask: Mask, ratio: number): Mask {
  const { width: w, height: h, data } = mask;
  const out = createMask(w, h);
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps: number[][] = [];
  let largest = 0;
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || label[s]) continue;
    const id = comps.length + 1;
    const members: number[] = [];
    let sp = 0;
    label[s] = id;
    stack[sp++] = s;
    while (sp > 0) {
      const p = stack[--sp]!;
      members.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] && !label[q]) {
            label[q] = id;
            stack[sp++] = q;
          }
        }
    }
    comps.push(members);
    largest = Math.max(largest, members.length);
  }
  for (const members of comps)
    if (members.length >= ratio * largest) for (const p of members) out.data[p] = 1;
  return out;
}
