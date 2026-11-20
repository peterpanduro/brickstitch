import type { jsPDF } from 'jspdf';
import type { Locale } from '../core';
import { drawText, PT_PER_MM } from './draw';
import { pdfSafe } from './winansi';

/** A4 portrait, millimetres. */
export const PAGE_W = 210;
export const PAGE_H = 297;
/** Page margin. */
export const M = 15;
export const WIDTH = PAGE_W - 2 * M;
/** Lowest baseline area for content; the footer sits below it. */
export const BOTTOM = PAGE_H - M - 4;
/** Usable height of a page. */
export const CONTENT_H = BOTTOM - M;
export const GREY = '#666666';

export type Style = 'normal' | 'bold' | 'italic';

/** Page cursor. */
export interface Flow {
  readonly doc: jsPDF;
  readonly locale: Locale;
  y: number;
}

/** Points to millimetres. */
export const mm = (pt: number): number => pt / PT_PER_MM;

/** Width in mm of `text` at `pt` points. */
export function textWidth(doc: jsPDF, text: string, pt: number, style: Style = 'normal'): number {
  doc.setFont('helvetica', style);
  doc.setFontSize(pt);
  return doc.getTextWidth(pdfSafe(text));
}

/** `text` wrapped to `width` mm. */
export function wrap(doc: jsPDF, text: string, pt: number, width: number, style: Style): string[] {
  doc.setFont('helvetica', style);
  doc.setFontSize(pt);
  return doc.splitTextToSize(pdfSafe(text), width) as string[];
}

/** `text`, shortened with `…` until it is at most `width` mm wide (`''` if not even `…` fits). */
export function fit(
  doc: jsPDF,
  text: string,
  pt: number,
  width: number,
  style: Style = 'normal',
): string {
  const s = pdfSafe(text);
  if (textWidth(doc, s, pt, style) <= width) return s;
  for (let n = s.length - 1; n > 0; n--) {
    const cut = `${s.slice(0, n).trimEnd()}…`;
    if (textWidth(doc, cut, pt, style) <= width) return cut;
  }
  return textWidth(doc, '…', pt, style) <= width ? '…' : '';
}

/** Starts a new page and puts the cursor at the top margin. */
export function newPage(f: Flow): void {
  f.doc.addPage();
  f.y = M;
}

/** Breaks the page unless `h` mm fit below the cursor. */
export function need(f: Flow, h: number): void {
  if (f.y + h > BOTTOM) newPage(f);
}

/** Wrapped paragraph at the cursor; `bullet` hangs a bullet in the indent. */
export function para(
  f: Flow,
  text: string,
  pt: number,
  o: { style?: Style; color?: string; indent?: number; bullet?: boolean; after?: number } = {},
): void {
  const size = mm(pt);
  const indent = o.indent ?? 0;
  const lines = wrap(f.doc, text, pt, WIDTH - indent, o.style ?? 'normal');
  lines.forEach((line, i) => {
    need(f, size * 1.4);
    const base = f.y + size * 0.85;
    if (i === 0 && o.bullet) drawText(f.doc, '•', M + 1, base, size, { color: o.color });
    drawText(f.doc, line, M + indent, base, size, { color: o.color, style: o.style });
    f.y += size * 1.4;
  });
  f.y += o.after ?? 0;
}
