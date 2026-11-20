import type { Box, Rotation } from '../../core';

/** Integer pixel rectangle of a crop selection. */
export type CropRect = Box;

/** Source image size and the orientation it is displayed with (SPEC R31: mirror, then rotate). */
export interface Orientation {
  readonly imgW: number;
  readonly imgH: number;
  readonly rotation: Rotation;
  readonly flipH: boolean;
}

/** What a pointer press on the crop view does: a resize handle, move, or a new selection. */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move' | 'new';

/** Minimum crop side in px (smaller only when the image itself is). */
export const MIN_CROP = 8;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Image size after `rotation` (sides swap at 90/270). */
export function orientedSize(
  w: number,
  h: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: h, height: w } : { width: w, height: h };
}

function rotateRect(r: CropRect, w: number, h: number, turns: number): CropRect {
  switch (turns % 4) {
    case 1:
      return { x: h - r.y - r.height, y: r.x, width: r.height, height: r.width };
    case 2:
      return { x: w - r.x - r.width, y: h - r.y - r.height, width: r.width, height: r.height };
    case 3:
      return { x: r.y, y: w - r.x - r.width, width: r.height, height: r.width };
    default:
      return { ...r };
  }
}

const flipRect = (r: CropRect, w: number): CropRect => ({ ...r, x: w - r.x - r.width });

/** Rect on the source image → the same pixels on the oriented (displayed) image. */
export function sourceRectToOriented(r: CropRect, o: Orientation): CropRect {
  const f = o.flipH ? flipRect(r, o.imgW) : r;
  return rotateRect(f, o.imgW, o.imgH, o.rotation / 90);
}

/** Rect on the oriented (displayed) image → the same pixels on the source image. */
export function orientedRectToSource(r: CropRect, o: Orientation): CropRect {
  const s = orientedSize(o.imgW, o.imgH, o.rotation);
  const back = rotateRect(r, s.width, s.height, 4 - o.rotation / 90);
  return o.flipH ? flipRect(back, o.imgW) : back;
}

function clampSpan(pos: number, len: number, size: number): [number, number] {
  const l = clamp(Math.round(len), Math.min(MIN_CROP, size), size);
  return [clamp(Math.round(pos), 0, size - l), l];
}

/** `r` rounded to integers, sized at least {@link MIN_CROP} and shifted inside a `w` × `h` image. */
export function clampRect(r: CropRect, w: number, h: number): CropRect {
  const [x, width] = clampSpan(r.x, r.width, w);
  const [y, height] = clampSpan(r.y, r.height, h);
  return { x, y, width, height };
}

/** Handle of `r` under point (x, y), within `tol` px of an edge; `new` outside the rect. */
export function cropHandle(r: CropRect, x: number, y: number, tol: number): CropHandle {
  const x1 = r.x + r.width;
  const y1 = r.y + r.height;
  if (x < r.x - tol || x > x1 + tol || y < r.y - tol || y > y1 + tol) return 'new';
  const v = Math.abs(y - r.y) <= tol ? 'n' : Math.abs(y - y1) <= tol ? 's' : '';
  const hz = Math.abs(x - r.x) <= tol ? 'w' : Math.abs(x - x1) <= tol ? 'e' : '';
  return ((v + hz) as CropHandle) || 'move';
}

/** `r` after dragging `handle` (not `new`) by (dx, dy) px on a `w` × `h` image. */
export function dragRect(
  handle: Exclude<CropHandle, 'new'>,
  r: CropRect,
  dx: number,
  dy: number,
  w: number,
  h: number,
): CropRect {
  const mx = Math.round(dx);
  const my = Math.round(dy);
  if (handle === 'move') return clampRect({ ...r, x: r.x + mx, y: r.y + my }, w, h);
  const minW = Math.min(MIN_CROP, w);
  const minH = Math.min(MIN_CROP, h);
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.width;
  let y1 = r.y + r.height;
  if (handle.includes('w')) x0 = clamp(x0 + mx, 0, x1 - minW);
  if (handle.includes('e')) x1 = clamp(x1 + mx, x0 + minW, w);
  if (handle.includes('n')) y0 = clamp(y0 + my, 0, y1 - minH);
  if (handle.includes('s')) y1 = clamp(y1 + my, y0 + minH, h);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function span(a: number, p: number, size: number): [number, number] {
  const lo = clamp(Math.round(Math.min(a, p)), 0, size);
  const hi = clamp(Math.round(Math.max(a, p)), 0, size);
  if (hi - lo >= MIN_CROP) return [lo, hi - lo];
  return clampSpan(p < a ? Math.round(a) - MIN_CROP : Math.round(a), MIN_CROP, size);
}

/** New selection from anchor (ax, ay) to point (px, py) on a `w` × `h` image. */
export function newRect(
  ax: number,
  ay: number,
  px: number,
  py: number,
  w: number,
  h: number,
): CropRect {
  const [x, width] = span(ax, px, w);
  const [y, height] = span(ay, py, h);
  return { x, y, width, height };
}

const STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** What an arrow key does: move the selection, or move its right/bottom (`end`) or left/top (`start`) edge. */
export type NudgeMode = 'move' | 'end' | 'start';

/** Arrow-key mode from modifiers: Shift = `end`, Alt = `start`, else `move`. */
export const nudgeMode = (m: { shiftKey: boolean; altKey: boolean }): NudgeMode =>
  m.shiftKey ? 'end' : m.altKey ? 'start' : 'move';

const MODE_HANDLE = { move: 'move', end: 'se', start: 'nw' } as const;

/**
 * `r` after an arrow key on a `w` × `h` image: moves by 1 % of the image side (at least 1 px) as
 * `mode` says. Without a selection the first arrow seeds a centred 80 % rect; null for other keys.
 */
export function nudgeRect(
  r: CropRect | null,
  key: string,
  mode: NudgeMode,
  w: number,
  h: number,
): CropRect | null {
  const step = STEPS[key];
  if (!step) return null;
  if (!r) return clampRect({ x: w * 0.1, y: h * 0.1, width: w * 0.8, height: h * 0.8 }, w, h);
  const dx = step[0] * Math.max(1, Math.round(w / 100));
  const dy = step[1] * Math.max(1, Math.round(h / 100));
  return dragRect(MODE_HANDLE[mode], r, dx, dy, w, h);
}

/** Handle hit tolerance in CSS px for a pointer type (larger for touch). */
export const hitTolerance = (pointerType: string): number => (pointerType === 'touch' ? 22 : 10);

/** Display canvas scale so the oriented image's long side is `target` px (about 2× its CSS size). */
export const displayScale = (w: number, h: number, target = 576): number => target / Math.max(w, h);
