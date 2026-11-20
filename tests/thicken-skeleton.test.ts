import { describe, expect, it } from 'vitest';
import { edt } from '../src/core/imaging/edt';
import { thickenSkeleton } from '../src/core/imaging/thicken';
import { zhangSuen } from '../src/core/imaging/thin';
import type { Mask } from '../src/core/imaging/types';

const N = 160;

/** The pre-R40 thickening: Zhang–Suen skeleton only. */
function zsOnly(mask: Mask, minWidthPx: number): Mask {
  const d2 = edt(zhangSuen(mask));
  const r2 = (minWidthPx / 2) ** 2;
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < d2.length; i++) data[i] = d2[i]! <= r2 || mask.data[i] ? 1 : 0;
  return { width: mask.width, height: mask.height, data };
}

function shape(f: (x: number, y: number) => boolean): Mask {
  const m = { width: N, height: N, data: new Uint8Array(N * N) };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) m.data[y * N + x] = f(x + 0.5, y + 0.5) ? 1 : 0;
  return m;
}

const seg =
  (ax: number, ay: number, bx: number, by: number, w: number) =>
  (x: number, y: number): boolean => {
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - ax - t * vx, y - ay - t * vy) <= w / 2;
  };

const rot =
  (deg: number, hw: number, hh: number) =>
  (x: number, y: number): boolean => {
    const a = (deg * Math.PI) / 180;
    const dx = x - 80;
    const dy = y - 80;
    return (
      Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) <= hw &&
      Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= hh
    );
  };

/** Shapes and their stroke width in px. */
const shapes: [string, number, Mask][] = [
  ['disc r40', 80, shape((x, y) => Math.hypot(x - 80, y - 80) <= 40)],
  ['square 60', 60, shape(rot(0, 30, 30))],
  ['square 60 @30', 60, shape(rot(30, 30, 30))],
  ['diamond 60', 60, shape(rot(45, 30, 30))],
  ['ring 10 wide', 10, shape((x, y) => Math.abs(Math.hypot(x - 80, y - 80) - 50) <= 5)],
];
for (const w of [9, 13, 16])
  for (const a of [0, 20, 45, 70]) shapes.push([`bar w${w} @${a}`, w, shape(rot(a, 60, w / 2))]);
for (const w of [9, 13]) {
  const A = (x: number, y: number) =>
    seg(40, 140, 80, 20, w)(x, y) ||
    seg(80, 20, 120, 140, w)(x, y) ||
    seg(55, 95, 105, 95, w)(x, y);
  const X = (x: number, y: number) =>
    seg(30, 30, 130, 130, w)(x, y) || seg(130, 30, 30, 130, w)(x, y);
  const V = (x: number, y: number) =>
    seg(30, 20, 80, 140, w)(x, y) || seg(80, 140, 130, 20, w)(x, y);
  shapes.push([`A w${w}`, w, shape(A)], [`X w${w}`, w, shape(X)], [`V w${w}`, w, shape(V)]);
}

describe('thickenSkeleton keeps the Zhang–Suen result where it has a centre line', () => {
  for (const mw of [5, 8, 12])
    for (const [name, w, m] of shapes)
      if (w >= mw)
        it(`${name} at min width ${mw}`, () => {
          const a = thickenSkeleton(m, mw).data;
          const b = zsOnly(m, mw).data;
          let diff = 0;
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
          expect(diff).toBe(0);
        });
});
