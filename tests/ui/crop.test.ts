import { describe, expect, it } from 'vitest';
import { cropImage, flipImage, rotateImage, type RgbaImage, type Rotation } from '../../src/core';
import {
  clampRect,
  cropHandle,
  displayScale,
  dragRect,
  hitTolerance,
  newRect,
  nudgeMode,
  nudgeRect,
  orientedRectToSource,
  orientedSize,
  sourceRectToOriented,
  type CropRect,
} from '../../src/ui/state/crop';
import { proportionalSize } from '../../src/ui/state/proportions';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Image whose pixel (x, y) encodes x in R and y in G. */
function coordImage(w: number, h: number): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([x, y, 0, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

const orient = (img: RgbaImage, rotation: Rotation, flipH: boolean): RgbaImage =>
  rotateImage(flipH ? flipImage(img, 'h') : img, (rotation / 90) as 0 | 1 | 2 | 3);

const coords = (img: RgbaImage): string[] => {
  const out: string[] = [];
  for (let i = 0; i < img.data.length; i += 4) out.push(`${img.data[i]},${img.data[i + 1]}`);
  return out.sort();
};

describe('orientedSize', () => {
  it('swaps sides at 90/270', () => {
    expect(orientedSize(40, 30, 0)).toEqual({ width: 40, height: 30 });
    expect(orientedSize(40, 30, 90)).toEqual({ width: 30, height: 40 });
    expect(orientedSize(40, 30, 180)).toEqual({ width: 40, height: 30 });
    expect(orientedSize(40, 30, 270)).toEqual({ width: 30, height: 40 });
  });
});

describe('orientedRectToSource / sourceRectToOriented', () => {
  const img = coordImage(13, 9);
  const src: CropRect = { x: 2, y: 1, width: 5, height: 3 };
  for (const rotation of ROTATIONS)
    for (const flipH of [false, true]) {
      const o = { imgW: 13, imgH: 9, rotation, flipH };
      it(`rotation ${rotation} flipH ${flipH}: oriented crop covers the same pixels`, () => {
        const viaOriented = cropImage(orient(img, rotation, flipH), sourceRectToOriented(src, o));
        expect(coords(viaOriented)).toEqual(coords(cropImage(img, src)));
      });
      it(`rotation ${rotation} flipH ${flipH}: round trip`, () => {
        expect(orientedRectToSource(sourceRectToOriented(src, o), o)).toEqual(src);
        const s = orientedSize(13, 9, rotation);
        const or: CropRect = { x: 1, y: 2, width: s.width - 3, height: s.height - 4 };
        expect(sourceRectToOriented(orientedRectToSource(or, o), o)).toEqual(or);
      });
      it(`rotation ${rotation} flipH ${flipH}: crop then orient = orient then crop`, () => {
        const or: CropRect = { x: 0, y: 3, width: 4, height: 5 };
        expect(orient(cropImage(img, orientedRectToSource(or, o)), rotation, flipH)).toEqual(
          cropImage(orient(img, rotation, flipH), or),
        );
      });
    }
});

describe('clampRect', () => {
  it('rounds to integers and keeps the rect inside the image', () => {
    expect(clampRect({ x: -3.4, y: 2.6, width: 20.2, height: 50 }, 40, 30)).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 30,
    });
  });
  it('enforces the 8 px minimum, shifting back inside', () => {
    expect(clampRect({ x: 38, y: 0, width: 2, height: 3 }, 40, 30)).toEqual({
      x: 32,
      y: 0,
      width: 8,
      height: 8,
    });
  });
  it('a tiny image limits the minimum to its size', () => {
    expect(clampRect({ x: 0, y: 0, width: 1, height: 1 }, 5, 20)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 8,
    });
  });
});

describe('cropHandle', () => {
  const r: CropRect = { x: 10, y: 10, width: 20, height: 20 };
  it('finds corners, edges, inside and outside within the tolerance', () => {
    expect(cropHandle(r, 10, 10, 2)).toBe('nw');
    expect(cropHandle(r, 31, 29, 2)).toBe('se');
    expect(cropHandle(r, 30, 10, 2)).toBe('ne');
    expect(cropHandle(r, 10, 30, 2)).toBe('sw');
    expect(cropHandle(r, 20, 9, 2)).toBe('n');
    expect(cropHandle(r, 20, 30, 2)).toBe('s');
    expect(cropHandle(r, 9, 20, 2)).toBe('w');
    expect(cropHandle(r, 31, 20, 2)).toBe('e');
    expect(cropHandle(r, 20, 20, 2)).toBe('move');
    expect(cropHandle(r, 2, 2, 2)).toBe('new');
    expect(cropHandle(r, 20, 40, 2)).toBe('new');
  });
});

describe('dragRect', () => {
  const r: CropRect = { x: 10, y: 10, width: 20, height: 20 };
  it('move translates and stays inside the image', () => {
    expect(dragRect('move', r, 5, -3, 40, 40)).toEqual({ x: 15, y: 7, width: 20, height: 20 });
    expect(dragRect('move', r, 100, -100, 40, 40)).toEqual({ x: 20, y: 0, width: 20, height: 20 });
  });
  it('edges and corners resize the dragged sides only', () => {
    expect(dragRect('e', r, 4, 9, 40, 40)).toEqual({ x: 10, y: 10, width: 24, height: 20 });
    expect(dragRect('nw', r, -4, 3, 40, 40)).toEqual({ x: 6, y: 13, width: 24, height: 17 });
    expect(dragRect('s', r, 0, 50, 40, 40)).toEqual({ x: 10, y: 10, width: 20, height: 30 });
  });
  it('resizing stops at the minimum size without moving the opposite side', () => {
    expect(dragRect('w', r, 30, 0, 40, 40)).toEqual({ x: 22, y: 10, width: 8, height: 20 });
    expect(dragRect('se', r, -30, -30, 40, 40)).toEqual({ x: 10, y: 10, width: 8, height: 8 });
  });
  it('rounds fractional deltas to integer px', () => {
    expect(dragRect('move', r, 1.6, 0.4, 40, 40)).toEqual({ x: 12, y: 10, width: 20, height: 20 });
  });
});

describe('newRect', () => {
  it('spans anchor and point in any direction, clamped', () => {
    expect(newRect(5, 5, 20, 15, 40, 30)).toEqual({ x: 5, y: 5, width: 15, height: 10 });
    expect(newRect(20, 15, 5, 5, 40, 30)).toEqual({ x: 5, y: 5, width: 15, height: 10 });
    expect(newRect(30, 20, 60, -5, 40, 30)).toEqual({ x: 30, y: 0, width: 10, height: 20 });
  });
  it('a short drag gets the minimum size, extending in the drag direction', () => {
    expect(newRect(20, 20, 18, 21, 40, 30)).toEqual({ x: 12, y: 20, width: 8, height: 8 });
    expect(newRect(38, 29, 39, 30, 40, 30)).toEqual({ x: 32, y: 22, width: 8, height: 8 });
  });
});

describe('nudgeRect', () => {
  const r: CropRect = { x: 50, y: 50, width: 100, height: 100 };
  it('arrows move by 1 % of the image side', () => {
    expect(nudgeRect(r, 'ArrowRight', 'move', 400, 200)).toEqual({ ...r, x: 54 });
    expect(nudgeRect(r, 'ArrowUp', 'move', 400, 200)).toEqual({ ...r, y: 48 });
  });
  it('end mode moves the right/bottom edge', () => {
    expect(nudgeRect(r, 'ArrowRight', 'end', 400, 200)).toEqual({ ...r, width: 104 });
    expect(nudgeRect(r, 'ArrowUp', 'end', 400, 200)).toEqual({ ...r, height: 98 });
  });
  it('start mode moves the left/top edge', () => {
    expect(nudgeRect(r, 'ArrowLeft', 'start', 400, 200)).toEqual({ ...r, x: 46, width: 104 });
    expect(nudgeRect(r, 'ArrowDown', 'start', 400, 200)).toEqual({ ...r, y: 52, height: 98 });
  });
  it('steps at least 1 px and clamps', () => {
    const s: CropRect = { x: 10, y: 10, width: 20, height: 20 };
    expect(nudgeRect(s, 'ArrowLeft', 'move', 40, 40)?.x).toBe(9);
    const m: CropRect = { x: 0, y: 0, width: 8, height: 8 };
    expect(nudgeRect(m, 'ArrowLeft', 'end', 40, 40)?.width).toBe(8);
    expect(nudgeRect(m, 'ArrowUp', 'move', 40, 40)?.y).toBe(0);
    expect(nudgeRect(m, 'ArrowRight', 'start', 40, 40)).toEqual(m);
  });
  it('the first arrow without a selection seeds a centred 80 % rect', () => {
    const seed = { x: 40, y: 20, width: 320, height: 160 };
    expect(nudgeRect(null, 'ArrowLeft', 'move', 400, 200)).toEqual(seed);
    expect(nudgeRect(null, 'ArrowDown', 'end', 400, 200)).toEqual(seed);
  });
  it('returns null for other keys', () => {
    expect(nudgeRect(r, 'Enter', 'move', 400, 200)).toBeNull();
    expect(nudgeRect(null, 'Enter', 'move', 400, 200)).toBeNull();
  });
});

describe('nudgeMode', () => {
  it('Shift resizes the end edges, Alt the start edges, else move', () => {
    expect(nudgeMode({ shiftKey: false, altKey: false })).toBe('move');
    expect(nudgeMode({ shiftKey: true, altKey: false })).toBe('end');
    expect(nudgeMode({ shiftKey: false, altKey: true })).toBe('start');
  });
});

describe('hitTolerance', () => {
  it('is larger for touch', () => {
    expect(hitTolerance('touch')).toBe(22);
    expect(hitTolerance('mouse')).toBe(10);
    expect(hitTolerance('pen')).toBe(10);
  });
});

describe('displayScale', () => {
  it('scales the long side to the target, up or down', () => {
    expect(displayScale(4000, 2000)).toBeCloseTo(576 / 4000);
    expect(displayScale(100, 200)).toBeCloseTo(576 / 200);
    expect(displayScale(300, 100, 600)).toBe(2);
  });
});

describe('proportionalSize with a crop', () => {
  it('uses the cropped size, oriented', () => {
    const c = { imgW: 100, imgH: 300, beadType: 'delica11' as const };
    expect(proportionalSize({ ...c, rotation: 0, width: 11 }).height).toBe(41);
    expect(proportionalSize({ ...c, rotation: 90, width: 40 }).height).toBe(16);
  });
});
