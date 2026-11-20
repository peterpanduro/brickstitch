import { BEAD_TYPES, sceneShapes, type Pattern, type Scene, type Shape } from '../core';
import { cellBounds } from './draw';

/** Flat drawing in millimetres, top-left origin. */
export interface Drawing {
  readonly widthMm: number;
  readonly heightMm: number;
  /** Height above the first lattice row (loop marker). */
  readonly topMm: number;
  readonly shapes: readonly Shape[];
}

/** 0-based lattice row a shape belongs to; the loop circle belongs to the row it sits on. */
function shapeRow(s: Shape, originY: number, bh: number): number | null {
  switch (s.t) {
    case 'bead':
    case 'slot':
    case 'marker':
      return s.r;
    case 'text':
      return s.r ?? null;
    case 'rect':
      return Math.round((s.y - originY) / bh);
    case 'circle':
      return Math.round((s.cy - originY) / bh + 0.4);
    case 'line':
      return Math.round((s.y1 - originY) / bh);
  }
}

function move(s: Shape, dx: number, dy: number): Shape {
  switch (s.t) {
    case 'bead':
    case 'slot':
      return { ...s, xMm: s.xMm - dx, yMm: s.yMm - dy };
    case 'rect':
    case 'marker':
    case 'text':
      return { ...s, x: s.x - dx, y: s.y - dy };
    case 'circle':
      return { ...s, cx: s.cx - dx, cy: s.cy - dy };
    case 'line':
      return { ...s, x1: s.x1 - dx, y1: s.y1 - dy, x2: s.x2 - dx, y2: s.y2 - dy };
  }
}

/** Lattice rows (0-based, inclusive) that hold beads. */
export function beadRows(scene: Scene, p: Pattern): [number, number] {
  const b = cellBounds(scene, BEAD_TYPES[p.beadType]);
  const bh = BEAD_TYPES[p.beadType].rowPitchMm;
  const r0 = Math.round((b.y - scene.origin.y) / bh);
  return [r0, r0 + Math.round(b.h / bh) - 1];
}

/**
 * `scene` cropped to the motif (SPEC R29): lattice columns outside the beads' cell bounds are
 * removed (gutters move in, slots outside are dropped) and only lattice rows `rows` are kept,
 * shifted to the top. Shapes keep their lattice positions relative to each other, so parity
 * is preserved. `scene` must have been built for `p`.
 */
export function cropScene(
  scene: Scene,
  p: Pattern,
  rows: readonly [number, number] = beadRows(scene, p),
): Drawing {
  const t = BEAD_TYPES[p.beadType];
  const b = cellBounds(scene, t);
  const latticeW = p.width * t.widthMm;
  const right = scene.origin.x + latticeW - 1e-6;
  const dxL = b.x - scene.origin.x;
  const dxR = latticeW - b.w;
  const [r0, r1] = rows;
  const dy = r0 * t.rowPitchMm;
  const width = scene.widthMm - dxR;
  const inside = (s: Shape): boolean => {
    const r = shapeRow(s, scene.origin.y, t.rowPitchMm);
    if (r !== null && (r < r0 || r > r1)) return false;
    if (s.t !== 'slot') return true;
    const x = scene.origin.x + (s.h * t.widthMm) / 2;
    return x >= b.x - 1e-6 && x + t.widthMm <= b.x + b.w + 1e-6;
  };
  const shapes = sceneShapes(scene)
    .filter(inside)
    .map((s): Shape => {
      if (s.t === 'rect') return { ...move(s, 0, dy), w: width } as Shape;
      if (s.t === 'text' || s.t === 'marker') {
        const dx = s.x < scene.origin.x ? 0 : s.x >= right ? dxR : dxL;
        return move(s, dx, dy);
      }
      return move(s, dxL, dy);
    });
  return {
    widthMm: width,
    heightMm: scene.origin.y + (r1 - r0 + 1) * t.rowPitchMm,
    topMm: scene.origin.y,
    shapes,
  };
}

/** Diagram layout: scale and lattice row ranges, inline on the first page or on own pages. */
export interface DiagramPlan {
  readonly s: number;
  readonly inline: boolean;
  readonly pages: readonly (readonly [number, number])[];
}

/** Smallest diagram scale (SPEC R29); wider motifs fall back to the full page width. */
export const MIN_SCALE = 2;
const MAX_SCALE = 8;
const MAX_W = 120;

/**
 * Picks the diagram scale: inline in `avail` when that allows at least {@link MIN_SCALE}, else
 * own pages of `page` size at ≥ {@link MIN_SCALE} (unless even that is wider than `page.w`),
 * split into row ranges that fit one page each.
 */
export function planDiagram(
  d: Drawing,
  rows: readonly [number, number],
  bh: number,
  avail: { readonly w: number; readonly h: number },
  page: { readonly w: number; readonly h: number },
): DiagramPlan {
  const inline = Math.min(avail.w / d.widthMm, avail.h / d.heightMm, MAX_SCALE);
  if (inline >= MIN_SCALE) return { s: inline, inline: true, pages: [rows] };
  const want = Math.max(MIN_SCALE, Math.min(MAX_W / d.widthMm, page.h / d.heightMm, MAX_SCALE));
  const s = Math.min(want, page.w / d.widthMm);
  const per = Math.max(1, Math.floor((page.h / s - d.topMm) / bh));
  const pages: [number, number][] = [];
  for (let r = rows[0]; r <= rows[1]; r += per) pages.push([r, Math.min(rows[1], r + per - 1)]);
  return { s, inline: false, pages };
}
