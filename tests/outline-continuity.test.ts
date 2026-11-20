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
const PAL = [
  { id: 'w', hex: '#ffffff' },
  { id: 'k', hex: '#000000' },
];
const target: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 30, height: 34 };
const settings: Partial<AnalysisSettings> = { background: 'borderKey', lineSensitivity: 0.5 };

/**
 * White disc on a pale background. `contour` draws a 4 px black contour along the left half;
 * `speckles` places black dots (radius 5) touching the right edge at the given angles (degrees).
 */
function disc(contour: boolean, speckles: readonly number[]): RgbaImage {
  const data = new Uint8ClampedArray(N * N * 4);
  const c = N / 2;
  const dots = speckles.map((a) => [
    c + (R - 4) * Math.cos((a * Math.PI) / 180),
    c + (R - 4) * Math.sin((a * Math.PI) / 180),
  ]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = x + 0.5 - c;
      const py = y + 0.5 - c;
      const r = Math.hypot(px, py);
      const ring = contour && px < 0 && r > R - 4;
      const dot = dots.some(([dx, dy]) => Math.hypot(x + 0.5 - dx!, y + 0.5 - dy!) <= 5);
      const rgb = r > R ? [255, 225, 190] : ring || dot ? [0, 0, 0] : [255, 255, 255];
      data.set([...rgb, 255], (y * N + x) * 4);
    }
  return { width: N, height: N, data };
}

function blackCells(img: RgbaImage): { left: number; right: number } {
  const cells = analyseImage(img, target, PAL, { ...DEFAULT_SETTINGS, ...settings }).pattern.cells;
  const xs = cells.flatMap((r) => r.flatMap((c, x) => (c !== null ? [x] : [])));
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  let left = 0;
  let right = 0;
  cells.forEach((r) =>
    r.forEach((c, x) => {
      if (c !== 'k') return;
      if (x < mid + 2) left++;
      else right++;
    }),
  );
  return { left, right };
}

describe('outline continuity (R59.2)', () => {
  it('grows a contour that follows the silhouette', () => {
    expect(blackCells(disc(true, [])).left).toBeGreaterThan(25);
  });
  it('leaves isolated edge speckles as they are', () => {
    expect(blackCells(disc(false, [-60, 0, 60])).right).toBeLessThanOrEqual(6);
  });
  it('keeps the contour and the speckles apart when both are present', () => {
    const b = blackCells(disc(true, [-60, 0, 60]));
    expect(b.left).toBeGreaterThan(25);
    expect(b.right).toBeLessThanOrEqual(6);
  });
});
