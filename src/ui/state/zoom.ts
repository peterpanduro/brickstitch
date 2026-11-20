import type { SizeMm } from './real-size';
import type { Settings } from './settings';

/** Canvas view settings: zoom (`fit` or px/mm) and real size. */
export type View = Pick<Settings, 'zoom' | 'realSize'>;

/** CSS pixels per millimetre (96 dpi): the scale of 100 %, i.e. real size. */
export const PX_PER_MM = 96 / 25.4;

/** Zoom limits in px/mm. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 80;

/** `s` clamped to {@link MIN_SCALE}–{@link MAX_SCALE}. */
export const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Pixels per scene millimetre as drawn: real size, the fit scale or the numeric zoom. */
export function displayScale(v: View, fit: number): number {
  if (v.realSize) return PX_PER_MM;
  return v.zoom === 'fit' ? fit : v.zoom;
}

/** Zoom bar percentage (SPEC R46): 100 % = real size in CSS millimetres. */
export function zoomPercent(v: View, fit: number): number {
  return v.realSize ? 100 : Math.round((displayScale(v, fit) / PX_PER_MM) * 100);
}

/** Zooms by `factor` from the displayed scale (clamped to 1–80 px/mm); turns real size off. */
export function zoomBy(v: View, fit: number, factor: number): View {
  return { zoom: clampScale(displayScale(v, fit) * factor), realSize: false };
}

/** Ctrl/⌘ + wheel or trackpad pinch (R51): zooms by `deltaY` (negative = in); real size off. */
export const wheelZoom = (v: View, fit: number, deltaY: number): View =>
  zoomBy(v, fit, Math.exp(-deltaY / 200));

/** "Visa allt": fit, not real size. */
export const fitView = (): View => ({ zoom: 'fit', realSize: false });

/** "Verklig storlek": toggles real size and keeps the zoom. */
export const toggleRealSize = (v: View): View => ({ zoom: v.zoom, realSize: !v.realSize });

/** Padding in CSS px on each side. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Width × height in CSS px. */
export interface SizePx {
  readonly width: number;
  readonly height: number;
}

/**
 * Base canvas viewport padding: room for the "Börja här" pill on the left (`left`), the
 * real-size card on the right and the zoom bar at the bottom.
 */
export const VIEW_PAD: Insets = { top: 64, right: 268, bottom: 80, left: 136 };

/** Padding of the paper sheet around the pattern. */
export const SHEET_PAD = 16;

/** Position of the floating tool card in the canvas area and the gap kept around it. */
export const TOOL_CARD = { left: 16, top: 14, gap: 12 } as const;

/** Fit scale (px/mm, at least {@link MIN_SCALE}) of `scene` in `box` minus `pad`. */
export function fitScale(box: SizePx, scene: SizeMm, pad: Insets): number {
  const w = (box.width - pad.left - pad.right) / scene.width;
  const h = (box.height - pad.top - pad.bottom) / scene.height;
  return Math.max(MIN_SCALE, Math.min(w, h));
}

/** `pad` plus the sheet padding on every side. */
export const withSheet = (pad: Insets): Insets => ({
  top: pad.top + SHEET_PAD,
  right: pad.right + SHEET_PAD,
  bottom: pad.bottom + SHEET_PAD,
  left: pad.left + SHEET_PAD,
});

/**
 * Viewport padding so the tool card (`card`, at {@link TOOL_CARD}) covers neither the sheet nor
 * the start pill left of it: the sheet either starts below the card or, with the pill room,
 * right of it, whichever gives the larger fit scale. `base` is the layout's padding (R51).
 */
export function canvasPadding(
  box: SizePx,
  scene: SizeMm,
  card: SizePx | null,
  base: Insets = VIEW_PAD,
): Insets {
  if (!card || card.width === 0) return base;
  const below = {
    ...base,
    top: Math.max(base.top, TOOL_CARD.top + card.height + TOOL_CARD.gap),
  };
  const beside = { ...base, left: TOOL_CARD.left + card.width + TOOL_CARD.gap + base.left };
  const fit = (p: Insets): number => fitScale(box, scene, withSheet(p));
  return fit(beside) > fit(below) ? beside : below;
}

/** Vertical centre of the start (ladder) row in scene mm, or `null` when there is none. */
export const startRowMm = (
  scene: { readonly origin: { readonly y: number } },
  ladderRow: number | null,
  rowPitchMm: number,
): number | null => (ladderRow === null ? null : scene.origin.y + (ladderRow + 0.5) * rowPitchMm);
