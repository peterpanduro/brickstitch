import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  type AnalysisSettings,
  type AnalysisTarget,
} from '../src/core/analysis';
import type { RgbaImage } from '../src/core/imaging';

const N = 400;
const R = 160;
const C = N / 2;
const PAL = [
  { id: 'w', hex: '#ffffff' },
  { id: 'k', hex: '#000000' },
];
const target: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 30, height: 34 };
const settings: Partial<AnalysisSettings> = { background: 'borderKey', lineSensitivity: 0.5 };
const BG = [255, 225, 190];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** What a scene draws at the disc-centred point `(px, py)`; `undefined` falls back to disc/background. */
type Scene = (px: number, py: number, r: number) => number[] | undefined;

function render(scene: Scene, cx = C): RgbaImage {
  const data = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const [px, py] = [x + 0.5 - cx, y + 0.5 - C];
      const r = Math.hypot(px, py);
      data.set([...(scene(px, py, r) ?? (r > R ? BG : WHITE)), 255], (y * N + x) * 4);
    }
  return { width: N, height: N, data };
}

/** Black contour (4 px) along the left half; with `gap` > 0, `gap` px of every 24 px of arc are white. */
const contour =
  (gap = 0): Scene =>
  (px, py, r) => {
    const inGap = gap > 0 && (((Math.atan2(py, px) * R) % 24) + 24) % 24 < gap;
    return px < 0 && r <= R && r > R - 4 && !inGap ? BLACK : undefined;
  };

/** Black dots (radius 5) touching the right edge of the disc at the given angles (degrees). */
const speckles =
  (angles: readonly number[]): Scene =>
  (px, py, r) =>
    r <= R &&
    angles.some((a) => {
      const t = (a * Math.PI) / 180;
      return Math.hypot(px - (R - 4) * Math.cos(t), py - (R - 4) * Math.sin(t)) <= 5;
    })
      ? BLACK
      : undefined;

/** Thin black strand (4 px) leaving the right edge of the disc, `len` px long. */
const strand =
  (len: number): Scene =>
  (px, py) =>
    Math.abs(py) < 2 && px > R - 6 && px < R + len ? BLACK : undefined;

const both =
  (...s: Scene[]): Scene =>
  (px, py, r) =>
    s.map((f) => f(px, py, r)).find((v) => v !== undefined);

/** Black beads in the left half and in the rightmost fifth of the pattern's bounding box. */
function blackCells(img: RgbaImage): { left: number; right: number } {
  const cells = analyseImage(img, target, PAL, { ...DEFAULT_SETTINGS, ...settings }).pattern.cells;
  const xs = cells.flatMap((r) => r.flatMap((c, x) => (c !== null ? [x] : [])));
  const x0 = Math.min(...xs);
  const span = Math.max(...xs) - x0 + 1;
  let left = 0;
  let right = 0;
  cells.forEach((row) =>
    row.forEach((c, x) => {
      if (c !== 'k') return;
      if (x - x0 < span / 2) left++;
      else if (x - x0 >= 0.8 * span) right++;
    }),
  );
  return { left, right };
}

describe('outline continuity (R59.2)', () => {
  it('grows a contour that follows the silhouette', () => {
    expect(blackCells(render(contour())).left).toBeGreaterThan(25);
  });
  it.each([2, 4, 6])('still grows a contour broken every 24 px by a %i px gap', (gap) => {
    expect(blackCells(render(contour(gap))).left).toBeGreaterThan(25);
  });
  it('leaves isolated edge speckles as they are next to a real contour', () => {
    const b = blackCells(render(both(contour(), speckles([-30, 0, 30]))));
    expect(b.left).toBeGreaterThan(25);
    expect(b.right).toBeLessThanOrEqual(3);
  });
  it('leaves a short thin protrusion (tail tip, whisker) as it is', () => {
    const b = blackCells(render(both(contour(), strand(30))));
    expect(b.left).toBeGreaterThan(25);
    expect(b.right).toBeLessThanOrEqual(6);
  });
  it('grows a short but real outline', () => {
    const arc: Scene = (px, py, r) =>
      Math.abs(Math.atan2(py, px) - Math.PI) < 0.65 && r <= R && r > R - 4 ? BLACK : undefined;
    expect(blackCells(render(arc)).left).toBeGreaterThan(8);
  });
  it('grows a contour that runs into the image border', () => {
    expect(blackCells(render(contour(), C - 120)).left).toBeGreaterThan(20);
  });
});
