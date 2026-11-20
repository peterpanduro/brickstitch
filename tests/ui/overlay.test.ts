import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  analyseImage,
  cropImage,
  type DebugLayer,
  type RgbaImage,
  type Rotation,
} from '../../src/core';
import { sourceRectToOriented, type CropRect } from '../../src/ui/state/crop';
import { labelPixels, layerPixels, layerToDisplay } from '../../src/ui/state/overlay';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const IMG_W = 120;
const IMG_H = 80;
/** Thin black stroke (source px). */
const STROKE: CropRect = { x: 20, y: 30, width: 60, height: 2 };

function strokeImage(): RgbaImage {
  const data = new Uint8ClampedArray(IMG_W * IMG_H * 4).fill(255);
  for (let y = STROKE.y; y < STROKE.y + STROKE.height; y++)
    for (let x = STROKE.x; x < STROKE.x + STROKE.width; x++)
      data.set([0, 0, 0, 255], (y * IMG_W + x) * 4);
  return { width: IMG_W, height: IMG_H, data };
}

/** Display-px centres of the set (or, with `unset`, unset) pixels of a mapped layer. */
function centres(l: DebugLayer, t: ReturnType<typeof layerToDisplay>, unset = false) {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++)
      if (!l.data[y * l.w + x] === unset)
        out.push({ x: t.x0 + (x + 0.5) * t.sx, y: t.y0 + (y + 0.5) * t.sy });
  return out;
}

const within = (p: { x: number; y: number }, r: CropRect, tol: number): boolean =>
  p.x >= r.x - tol && p.x <= r.x + r.width + tol && p.y >= r.y - tol && p.y <= r.y + r.height + tol;

describe('layerToDisplay', () => {
  it('shifts by the oriented crop offset and keeps the scale', () => {
    const o = { imgW: 100, imgH: 50, rotation: 90 as Rotation, flipH: false };
    const crop = { x: 10, y: 5, width: 30, height: 20 };
    const t = layerToDisplay({ x0: 2, y0: 3, sx: 1.5, sy: 2 }, crop, o);
    const off = sourceRectToOriented(crop, o);
    expect(t).toEqual({ x0: off.x + 2, y0: off.y + 3, sx: 1.5, sy: 2 });
    expect(layerToDisplay({ x0: 2, y0: 3, sx: 1, sy: 1 }, null, o)).toEqual({
      x0: 2,
      y0: 3,
      sx: 1,
      sy: 1,
    });
  });

  const crops: (CropRect | null)[] = [null, { x: 10, y: 20, width: 90, height: 40 }];
  for (const rotation of ROTATIONS)
    for (const flipH of [false, true])
      for (const crop of crops)
        it(`places the analysed stroke on the displayed image (rot ${rotation}, mirror ${flipH}, crop ${!!crop})`, () => {
          const o = { imgW: IMG_W, imgH: IMG_H, rotation, flipH };
          const img = strokeImage();
          const a = analyseImage(
            crop ? cropImage(img, crop) : img,
            { beadType: 'delica11', mode: 'shaped', width: 20, height: 20 },
            [
              { id: 'w', hex: '#ffffff' },
              { id: 'k', hex: '#000000' },
            ],
            { ...DEFAULT_SETTINGS, rotation, flipH, lineSensitivity: 0.8 },
            { debug: true },
          );
          const d = a.debug!;
          const want = sourceRectToOriented(STROKE, o);
          const bgT = layerToDisplay(d.backgroundMask.transform, crop, o);
          const fg = centres(d.backgroundMask, bgT, true);
          expect(fg.length).toBe(STROKE.width * STROKE.height);
          for (const p of fg) expect(within(p, want, 0)).toBe(true);
          const lt = layerToDisplay(d.thin.transform, crop, o);
          const thin = centres(d.thin, lt);
          expect(thin.length).toBeGreaterThan(20);
          for (const p of thin) expect(within(p, want, 1)).toBe(true);
          const fgLabels = { ...d.labels, data: Uint8Array.from(d.labels.data, (v) => +(v >= 0)) };
          const lab = centres(fgLabels, layerToDisplay(d.labels.transform, crop, o));
          expect(lab.length).toBeGreaterThan(20);
          const reach = d.minLineWidthPx * d.labels.transform.sx + 1;
          for (const p of lab) expect(within(p, want, reach)).toBe(true);
          if (crop) {
            const c = sourceRectToOriented(crop, o);
            const corner = { x: lt.x0 + d.thin.w * lt.sx, y: lt.y0 + d.thin.h * lt.sy };
            expect(lt.x0).toBeGreaterThan(c.x - 10);
            expect(corner.x).toBeLessThan(c.x + c.width + 10);
            expect(corner.y).toBeLessThan(c.y + c.height + 10);
          }
        });
});

describe('layerPixels', () => {
  const t = { x0: 0, y0: 0, sx: 1, sy: 1 };
  const layer = (data: number[]): DebugLayer => ({
    data: Uint8Array.from(data),
    w: 2,
    h: 1,
    transform: t,
  });

  it('paints set pixels, later layers on top, unset transparent', () => {
    const px = layerPixels([
      { layer: layer([1, 1]), rgba: [1, 2, 3, 4] },
      { layer: layer([0, 1]), rgba: [5, 6, 7, 8] },
    ]);
    expect([...px.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...layerPixels([{ layer: layer([0, 0]), rgba: [1, 2, 3, 4] }]).data]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('rejects layers of different sizes', () => {
    const other: DebugLayer = { data: new Uint8Array(3), w: 3, h: 1, transform: t };
    expect(() =>
      layerPixels([
        { layer: layer([0, 0]), rgba: [0, 0, 0, 0] },
        { layer: other, rgba: [0, 0, 0, 0] },
      ]),
    ).toThrow();
  });
});

describe('labelPixels', () => {
  it('paints each label in its palette colour, background transparent', () => {
    const px = labelPixels(
      { data: Int16Array.from([-1, 0, 1]), w: 3, h: 1, transform: { x0: 0, y0: 0, sx: 1, sy: 1 } },
      ['#ff0000', '#00ff7f'],
    );
    expect(px.w).toBe(3);
    expect([...px.data]).toEqual([0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 127, 255]);
  });
});
