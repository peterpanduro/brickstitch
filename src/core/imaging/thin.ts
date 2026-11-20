import type { Mask } from './types';

const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/**
 * Zhang-Suen thinning to a 1-px skeleton. A candidate worklist limits work to
 * the shrinking boundary instead of rescanning the whole grid each pass.
 */
export function zhangSuen(mask: Mask): Mask {
  const w = mask.width + 2;
  const h = mask.height + 2;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) g[(y + 1) * w + x + 1] = mask.data[y * mask.width + x]!;
  const nb = DX.map((dx, i) => DY[i]! * w + dx);
  const [oN, oNE, oE, oSE, oS, oSW, oW, oNW] = nb as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const stamp = new Uint32Array(w * h);
  let epoch = 0;

  const deletable = (p: number, second: boolean): boolean => {
    const n0 = g[p + oN]!;
    const n1 = g[p + oNE]!;
    const n2 = g[p + oE]!;
    const n3 = g[p + oSE]!;
    const n4 = g[p + oS]!;
    const n5 = g[p + oSW]!;
    const n6 = g[p + oW]!;
    const n7 = g[p + oNW]!;
    const b = n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7;
    if (b < 2 || b > 6) return false;
    const a =
      (!n0 && n1 ? 1 : 0) +
      (!n1 && n2 ? 1 : 0) +
      (!n2 && n3 ? 1 : 0) +
      (!n3 && n4 ? 1 : 0) +
      (!n4 && n5 ? 1 : 0) +
      (!n5 && n6 ? 1 : 0) +
      (!n6 && n7 ? 1 : 0) +
      (!n7 && n0 ? 1 : 0);
    if (a !== 1) return false;
    return second
      ? n0 * n2 * n6 === 0 && n0 * n4 * n6 === 0
      : n0 * n2 * n4 === 0 && n2 * n4 * n6 === 0;
  };

  const pass = (cands: number[], second: boolean): number[] => {
    const del: number[] = [];
    for (const p of cands) if (g[p] && deletable(p, second)) del.push(p);
    for (const p of del) g[p] = 0;
    return del;
  };

  const addNeighbours = (pixels: number[], into: number[]): void => {
    for (const p of pixels)
      for (const o of nb) {
        const q = p + o;
        if (g[q] && stamp[q] !== epoch) {
          stamp[q] = epoch;
          into.push(q);
        }
      }
  };

  let cands: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (g[p] && nb.some((o) => !g[p + o])) cands.push(p);
    }

  while (cands.length > 0) {
    const first = pass(cands, false);
    epoch++;
    const second: number[] = [];
    for (const p of cands)
      if (g[p]) {
        stamp[p] = epoch;
        second.push(p);
      }
    addNeighbours(first, second);
    const last = pass(second, true);
    epoch++;
    const next: number[] = [];
    addNeighbours(first, next);
    addNeighbours(last, next);
    cands = next;
  }

  const out = new Uint8Array(mask.width * mask.height);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) out[y * mask.width + x] = g[(y + 1) * w + x + 1]!;
  return { width: mask.width, height: mask.height, data: out };
}
