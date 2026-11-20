import type { jsPDF } from 'jspdf';
import {
  BEAD_ROUNDING,
  MARK_STYLE,
  SCENE_STYLE,
  slotSlash,
  type BeadType,
  type Scene,
  type Shape,
} from '../core';
import { pdfSafe } from './winansi';

/** Points per millimetre. */
export const PT_PER_MM = 72 / 25.4;

/** Where a scene goes on the page: scene `(x, y)` maps to `(x0 + s·x, y0 + s·y)`. */
export interface Placement {
  readonly x0: number;
  readonly y0: number;
  readonly s: number;
}

const S = SCENE_STYLE.stroke;
const ALIGN = { start: 'left', middle: 'center', end: 'right' } as const;

/** Draws `text` with Helvetica; `sizeMm` is the font size in millimetres. */
export function drawText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  o: { color?: string; style?: 'normal' | 'bold' | 'italic'; anchor?: keyof typeof ALIGN } = {},
): void {
  doc.setFont('helvetica', o.style ?? 'normal');
  doc.setFontSize(sizeMm * PT_PER_MM);
  doc.setTextColor(o.color ?? SCENE_STYLE.text);
  doc.text(pdfSafe(text), x, y, { align: ALIGN[o.anchor ?? 'start'] });
}

function stroke(doc: jsPDF, color: string, width: number): void {
  doc.setDrawColor(color);
  doc.setLineWidth(width);
}

function drawBead(doc: jsPDF, b: Extract<Shape, { t: 'bead' }>, at: Placement): void {
  const { s } = at;
  const [x, y, w, h] = [at.x0 + s * b.xMm, at.y0 + s * b.yMm, s * b.wMm, s * b.hMm];
  const rx = Math.min(w, h) * BEAD_ROUNDING;
  doc.setFillColor(b.fill);
  stroke(doc, SCENE_STYLE.beadStroke, Math.max(S.bead * s, MIN_OUTLINE));
  doc.roundedRect(x, y, w, h, rx, rx, 'FD');
  if (!b.mark) return;
  const m = MARK_STYLE[b.mark];
  const [ix, iy] = [w * 0.2, h * 0.2];
  for (const [color, k] of [
    [HALO, 2.2],
    [m.stroke, 1],
  ] as const) {
    stroke(doc, color, S.mark * s * k);
    if (m.dash && k === 1) doc.setLineDashPattern(dash(m.dash, s), 0);
    doc.roundedRect(x, y, w, h, rx, rx, 'S');
    doc.setLineDashPattern([], 0);
    if (!m.hatch) continue;
    stroke(doc, color, S.hatch * s * k);
    doc.line(x + ix, y + iy, x + w - ix, y + h - iy);
    doc.line(x + ix, y + h - iy, x + w - ix, y + iy);
  }
}

const HALO = '#ffffff';
/** Thinnest bead outline in print (mm), so white beads stay visible at 1:1. */
const MIN_OUTLINE = 0.1;
const dash = (d: string, s: number): number[] => d.split(' ').map((v) => Number(v) * s);

function drawMarker(doc: jsPDF, m: Extract<Shape, { t: 'marker' }>, at: Placement): void {
  const z = m.size * at.s;
  const x = at.x0 + m.x * at.s;
  const y = at.y0 + m.y * at.s;
  if (m.kind === 'alert') {
    doc.setFillColor(SCENE_STYLE.alert);
    doc.triangle(x + z / 2, y - z / 2, x + z, y + z / 2, x, y + z / 2, 'F');
    const o = { color: SCENE_STYLE.alertText, style: 'bold', anchor: 'middle' } as const;
    drawText(doc, '!', x + z / 2, y + z * 0.42, z * 0.75, o);
    return;
  }
  stroke(doc, SCENE_STYLE.text, S.marker * at.s);
  doc.line(x + z * 0.15, y - z / 2, x + z * 0.4, y);
  doc.line(x + z * 0.65, y - z / 2, x + z * 0.4, y);
  doc.line(x + z * 0.4, y, x + z * 0.4, y + z / 2);
  drawText(doc, String(m.value ?? ''), x + z * 0.8, y + z * 0.35, z);
}

/** Draws scene shapes as vector graphics; empty-cell slots are skipped. */
export function drawShapes(doc: jsPDF, shapes: readonly Shape[], at: Placement): void {
  const { x0, y0, s } = at;
  for (const sh of shapes) {
    switch (sh.t) {
      case 'bead':
        drawBead(doc, sh, at);
        break;
      case 'rect':
        doc.setFillColor(sh.fill);
        doc.rect(x0 + s * sh.x, y0 + s * sh.y, s * sh.w, s * sh.h, 'F');
        break;
      case 'circle':
        stroke(doc, sh.stroke, S.loop * s);
        if (sh.fill) doc.setFillColor(sh.fill);
        doc.circle(x0 + s * sh.cx, y0 + s * sh.cy, s * sh.r, sh.fill ? 'FD' : 'S');
        break;
      case 'line':
        stroke(doc, sh.stroke, S.line * s);
        doc.line(x0 + s * sh.x1, y0 + s * sh.y1, x0 + s * sh.x2, y0 + s * sh.y2);
        break;
      case 'marker':
        drawMarker(doc, sh, at);
        break;
      case 'text':
        drawText(doc, sh.text, x0 + s * sh.x, y0 + s * sh.y, s * sh.size, {
          color: sh.fill ?? SCENE_STYLE.text,
          style: sh.role === 'ladder' ? 'bold' : 'normal',
          anchor: sh.anchor,
        });
        break;
      case 'slot': {
        const [x, y, w, h] = [x0 + s * sh.xMm, y0 + s * sh.yMm, s * sh.wMm, s * sh.hMm];
        const rx = Math.min(w, h) * BEAD_ROUNDING;
        stroke(doc, SCENE_STYLE.slot, S.slot * s);
        doc.roundedRect(x, y, w, h, rx, rx, 'S');
        const l = slotSlash(sh);
        stroke(doc, SCENE_STYLE.slotSlash, S.slotSlash * s);
        doc.line(x0 + s * l.x1, y0 + s * l.y1, x0 + s * l.x2, y0 + s * l.y2);
        break;
      }
    }
  }
}

/** Box covering the lattice cells of all beads in `scene`, in scene millimetres. */
export function cellBounds(
  scene: Scene,
  t: BeadType,
): { x: number; y: number; w: number; h: number } {
  const beads = scene.rows.flatMap((r) => r.shapes).filter((s) => s.t === 'bead');
  const hs = beads.map((b) => b.h);
  const rs = beads.map((b) => b.r);
  const [h0, h1, r0, r1] = [Math.min(...hs), Math.max(...hs), Math.min(...rs), Math.max(...rs)];
  return {
    x: scene.origin.x + (h0 * t.widthMm) / 2,
    y: scene.origin.y + r0 * t.rowPitchMm,
    w: ((h1 - h0) / 2 + 1) * t.widthMm,
    h: (r1 - r0 + 1) * t.rowPitchMm,
  };
}
