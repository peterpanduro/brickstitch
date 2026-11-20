import { describe, expect, it } from 'vitest';
import { BEAD_TYPES, type Pattern } from '../src/core';
import { DEFAULT_SETTINGS, analyseImage } from '../src/core/analysis';
import { strokeSkeleton, thickenSkeleton } from '../src/core/imaging/thicken';
import type { RgbaImage } from '../src/core/imaging';
import { createMask } from '../src/core/imaging/mask';

/** Black line on white through the centre, 80 % of `size` long; `ss` × `ss` supersampled (1 = aliased). */
function line(angle: number, width: number, size: number, ss: number, off = 0): RgbaImage {
  const SIZE = size;
  const SS = ss;
  const HALF_LEN = 0.4 * size;
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  const c = SIZE / 2 + off;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let n = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const dx = x + (sx + 0.5) / SS - c;
          const dy = y + (sy + 0.5) / SS - c;
          const along = dx * ux + dy * uy;
          const across = -dx * uy + dy * ux;
          if (Math.abs(along) <= HALF_LEN && Math.abs(across) <= width / 2) n++;
        }
      const v = Math.round(255 * (1 - n / (SS * SS)));
      data.set([v, v, v, 255], (y * SIZE + x) * 4);
    }
  return { width: SIZE, height: SIZE, data };
}

type Cell = { r: number; h: number };
const beads = (p: Pattern): Cell[] =>
  p.cells.flatMap((row, r) =>
    row.flatMap((c, i) => (c === null ? [] : [{ r, h: 2 * i + (r & 1) }])),
  );

/** Connected components under brick adjacency (same row h ± 2, adjacent rows h ± 1). */
function components(cells: readonly Cell[]): number {
  const key = (c: Cell) => `${c.r},${c.h}`;
  const left = new Set(cells.map(key));
  let n = 0;
  for (const c of cells) {
    if (!left.has(key(c))) continue;
    n++;
    const stack = [c];
    left.delete(key(c));
    while (stack.length) {
      const q = stack.pop()!;
      for (const [dr, dh] of [
        [0, -2],
        [0, 2],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ] as const) {
        const nb = { r: q.r + dr, h: q.h + dh };
        if (left.delete(key(nb))) stack.push(nb);
      }
    }
  }
  return n;
}

describe('thin lines at sensitivity 0.8 (any angle)', () => {
  const t = BEAD_TYPES.delica11;
  const variants = [
    { size: 300, ss: 4, off: 0 },
    { size: 640, ss: 4, off: 0 },
    { size: 400, ss: 1, off: 0 },
    { size: 640, ss: 1, off: 0.5 },
  ];
  const cases = [0, 15, 30, 40, 45, 60, 90, 120, 135, 150].flatMap((angle) =>
    [1, 1.5, 2].flatMap((width) => variants.map((v) => ({ angle, width, ...v }))),
  );
  for (const { angle, width, size, ss, off } of cases)
    it(`rasterises a ${width} px line at ${angle}° continuously (${size} px, ${ss === 1 ? 'aliased' : 'anti-aliased'}, offset ${off})`, () => {
      const a = analyseImage(
        line(angle, width, size, ss, off),
        { beadType: 'delica11', mode: 'shaped', width: 20, height: 20 },
        [
          { id: 'w', hex: '#ffffff' },
          { id: 'k', hex: '#000000' },
        ],
        { ...DEFAULT_SETTINGS, lineSensitivity: 0.8, fixRings: false, autoPrune: false },
        { debug: true },
      );
      const cells = beads(a.pattern);
      expect(cells.length).toBeGreaterThan(0);
      expect(components(cells)).toBe(1);
      const rad = (angle * Math.PI) / 180;
      const proj = cells.map(
        (c) =>
          (((c.h + 1) * t.widthMm) / 2) * Math.cos(rad) -
          (c.r + 0.5) * t.rowPitchMm * Math.sin(rad),
      );
      const span = Math.max(...proj) - Math.min(...proj) + t.widthMm;
      const tr = a.debug!.added.transform;
      const lengthMm =
        0.8 * size * a.stats.mmPerPx * Math.hypot(Math.cos(rad) / tr.sx, Math.sin(rad) / tr.sy);
      expect(span).toBeGreaterThanOrEqual(0.9 * lengthMm);
    });
});

describe('a 3-px-band diagonal that downscales to a 2 px staircase', () => {
  it('is rasterised continuously over its length', () => {
    const w = 400;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const on = x + 0.5 > 40 && x + 0.5 < 360 && Math.abs(x - y) / Math.SQRT2 <= 0.75;
        const v = on ? 0 : 255;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    const a = analyseImage(
      { width: w, height: w, data },
      { beadType: 'delica11', mode: 'shaped', width: 20, height: 20 },
      [
        { id: 'w', hex: '#ffffff' },
        { id: 'k', hex: '#000000' },
      ],
      { ...DEFAULT_SETTINGS, lineSensitivity: 0.8, fixRings: false, autoPrune: false },
    );
    const cells = beads(a.pattern);
    expect(components(cells)).toBe(1);
    const rows = cells.map((c) => c.r);
    expect(Math.max(...rows) - Math.min(...rows) + 1).toBeGreaterThanOrEqual(0.9 * 20);
  });
});

describe('thickenSkeleton on 2 px diagonal staircases', () => {
  it('grows the whole length of a 2 px 45° staircase', () => {
    const m = createMask(60, 60);
    for (let i = 5; i < 55; i++) {
      m.data[i * 60 + i] = 1;
      m.data[i * 60 + i + 1] = 1;
    }
    const g = thickenSkeleton(m, 8);
    for (let i = 8; i < 52; i++) {
      expect(g.data[(i + 2) * 60 + i]).toBe(1);
      expect(g.data[i * 60 + i + 3]).toBe(1);
    }
  });

  for (const perRow of [1, 2, 3, 4])
    for (const up of [false, true])
      it(`keeps a skeleton along a ${perRow}-px-per-row ${up ? 'rising' : 'falling'} diagonal`, () => {
        const m = createMask(60, 60);
        for (let y = 0; y < 60; y++)
          for (let x = 6; x < 55; x++) {
            const k = up ? x + y - 59 : x - y;
            if (k >= 0 && k < perRow) m.data[y * 60 + x] = 1;
          }
        const s = strokeSkeleton(m, 8);
        const xs: number[] = [];
        for (let p = 0; p < s.data.length; p++) if (s.data[p]) xs.push(p % 60);
        expect(Math.min(...xs)).toBeLessThan(10);
        expect(Math.max(...xs)).toBeGreaterThan(50);
        expect(xs.length).toBeGreaterThan(40);
      });
});
