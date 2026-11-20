import {
  BEAD_TYPES,
  beadRect,
  ON_BEAD_CENTRES,
  placeRing,
  ringAnchorCentred,
  ringAnchorFromClick,
  ringCandidates,
  type BeadTypeId,
  type Coord,
  type Pattern,
  type RingCandidate,
  type RingSearchParams,
  type Shape,
} from '../../core';
import { applyEdit, current, type EditorState } from './editor';

/** Outer ring width limits in beads. */
export const RING_WIDTH = { min: 3, max: 30 } as const;

/** Ring tool options (SPEC R36). */
export interface RingToolState {
  readonly widthBeads: number;
  /** Thickness search range in mm; `null` = the optimiser default. */
  readonly thicknessMm: { readonly min: number; readonly max: number } | null;
  /** Centre horizontally on panels: on-bead centres, anchor snapped to the middle column. */
  readonly centreH: boolean;
  /** Index of the selected candidate. */
  readonly selected: number;
}

const clampWidth = (n: number): number =>
  Math.min(RING_WIDTH.max, Math.max(RING_WIDTH.min, Math.round(n)));

/** Ring options for `p`: `min(9, W − 2)` beads wide (at least 3), centred, first candidate. */
export const initRingTool = (p: Pattern): RingToolState => ({
  widthBeads: clampWidth(Math.min(9, p.width - 2)),
  thicknessMm: null,
  centreH: true,
  selected: 0,
});

/** Sets the width (rounded, clamped to {@link RING_WIDTH}); `s` itself for a non-number. */
export const setRingWidth = (s: RingToolState, n: number): RingToolState =>
  Number.isFinite(n) ? { ...s, widthBeads: clampWidth(n), selected: 0 } : s;

/** Sets the thickness range (`0 < min ≤ max`, else `s`); `null` restores the default. */
export function setRingThickness(
  s: RingToolState,
  t: { readonly min: number; readonly max: number } | null,
): RingToolState {
  if (t !== null && !(t.min > 0 && t.min <= t.max)) return s;
  return { ...s, thicknessMm: t, selected: 0 };
}

/** Turns "centre horizontally" on or off. */
export const setRingCentred = (s: RingToolState, centreH: boolean): RingToolState => ({
  ...s,
  centreH,
  selected: 0,
});

/** Selects candidate `i` (a non-negative integer, else `s`). */
export const selectRingCandidate = (s: RingToolState, i: number): RingToolState =>
  Number.isInteger(i) && i >= 0 ? { ...s, selected: i } : s;

/** Whether placement is centred: a panel with "centre horizontally" on. */
export const ringCentred = (p: Pattern, s: RingToolState): boolean =>
  p.mode === 'panel' && s.centreH;

/** Optimiser parameters; centred placement searches on-bead centres only. */
export const ringSearchParams = (p: Pattern, s: RingToolState): RingSearchParams => ({
  beadType: p.beadType,
  targetWidthBeads: s.widthBeads,
  ...(s.thicknessMm ? { thicknessMm: s.thicknessMm } : {}),
  ...(ringCentred(p, s) ? { centres: ON_BEAD_CENTRES } : {}),
});

/**
 * `search` memoised by (beadType, width, diameter, thickness, centres), keeping the `size` most
 * recent results.
 */
export function memoRingSearch(
  search: (p: RingSearchParams) => RingCandidate[] = ringCandidates,
  size = 16,
): (p: RingSearchParams) => readonly RingCandidate[] {
  const cache = new Map<string, readonly RingCandidate[]>();
  return (p) => {
    const key = JSON.stringify([
      p.beadType ?? 'delica11',
      p.targetWidthBeads,
      p.targetDiameterMm,
      p.thicknessMm,
      p.centres,
      p.maxCandidates,
    ]);
    const hit = cache.get(key);
    if (hit) return hit;
    const out = search(p);
    cache.set(key, out);
    if (cache.size > size) cache.delete(cache.keys().next().value as string);
    return out;
  };
}

/**
 * Anchor for the pointer at lattice-local mm `(xMm, yMm)`. Centred: the ring centre is on the
 * middle column and the row nearest the pointer that the lattice parity allows (ties: smaller
 * r); otherwise {@link ringAnchorFromClick}.
 */
export function ringAnchor(
  p: Pattern,
  s: RingToolState,
  c: RingCandidate,
  xMm: number,
  yMm: number,
): Coord {
  return ringCentred(p, s) ? ringAnchorCentred(p, c, yMm) : ringAnchorFromClick(p, xMm, yMm, c);
}

/**
 * `a` re-snapped by {@link ringAnchor} from its own ring centre (e.g. after centring is turned
 * on); `a` itself when not centring.
 */
export function resnapAnchor(p: Pattern, s: RingToolState, c: RingCandidate, a: Coord): Coord {
  if (!ringCentred(p, s)) return a;
  const t = BEAD_TYPES[p.beadType];
  const y = (a.r + 0.5 + (c.centre.onRow ? 0 : 0.5)) * t.rowPitchMm;
  return ringAnchor(p, s, c, 0, y);
}

/**
 * Arrow-key move of the anchor: a bead left/right or a row up/down (zig-zagging to keep
 * `h − r` even); centred, two rows up/down and no sideways move. `null` for other keys.
 */
export function nudgeAnchor(a: Coord, key: string, centred: boolean): Coord | null {
  const dr = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  const dh = key === 'ArrowRight' ? 2 : key === 'ArrowLeft' ? -2 : 0;
  if (centred) return dr ? { r: a.r + 2 * dr, h: a.h } : null;
  if (dh) return { r: a.r, h: a.h + dh };
  return dr ? { r: a.r + dr, h: a.h + ((a.r & 1) === 0 ? -1 : 1) } : null;
}

/**
 * Places `c` at `anchor` in the current colour as one undo step; `placed` = beads on the
 * lattice. Unchanged (`clipped` and `placed` 0) without a colour, during a stroke, or for an
 * anchor with odd `h − r`.
 */
export function placeRingEdit(
  s: EditorState,
  c: RingCandidate,
  anchor: Coord,
): { state: EditorState; clipped: number; placed: number } {
  const color = s.color;
  if (color === null || s.stroke || (anchor.h - anchor.r) % 2 !== 0)
    return { state: s, clipped: 0, placed: 0 };
  const r = placeRing(current(s), c, anchor, color);
  return {
    state: applyEdit(s, () => r.pattern),
    clipped: r.clipped,
    placed: c.cells.length - r.clipped,
  };
}

/** Touch shows the ghost on press and places on release; mouse and pen place on press. */
export const placesOnRelease = (pointerType: string): boolean => pointerType === 'touch';

/** Whether two anchors (or both `null`) are the same cell. */
export const sameAnchor = (a: Coord | null, b: Coord | null): boolean =>
  a === b || (a !== null && b !== null && a.r === b.r && a.h === b.h);

/** Selected candidate index, `0` when it is out of range for `n` candidates. */
export const ringSelectedIndex = (s: RingToolState, n: number): number =>
  s.selected < n ? s.selected : 0;

/** Radiogroup key target: arrows step and wrap, Home/End jump; `null` for other keys or none. */
export function ringRadioTarget(key: string, i: number, n: number): number | null {
  if (n === 0) return null;
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[key];
  if (step) return (i + step + n) % n;
  return key === 'Home' ? 0 : key === 'End' ? n - 1 : null;
}

/** Bead shapes of `cells` in scene mm with the lattice origin at `origin`. */
export const ringBeads = (
  cells: readonly Coord[],
  beadType: BeadTypeId,
  fill: string,
  origin: { readonly x: number; readonly y: number },
): Shape[] =>
  cells.map((c) => ({
    t: 'bead',
    r: c.r,
    h: c.h,
    ...beadRect({ t: BEAD_TYPES[beadType], origin }, c.r, c.h),
    fill,
  }));

/** Candidate preview: bead shapes plus the view box around them (mm). */
export function ringPreview(
  c: RingCandidate,
  beadType: BeadTypeId,
  fill: string,
): { shapes: Shape[]; x: number; y: number; widthMm: number; heightMm: number } {
  const t = BEAD_TYPES[beadType];
  const r0 = Math.min(...c.cells.map((q) => q.r));
  const h0 = Math.min(...c.cells.map((q) => q.h));
  return {
    shapes: ringBeads(c.cells, beadType, fill, { x: 0, y: 0 }),
    x: (h0 * t.widthMm) / 2,
    y: r0 * t.rowPitchMm,
    widthMm: c.score.widthMm,
    heightMm: c.score.heightMm,
  };
}
