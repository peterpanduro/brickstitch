import { jsPDF } from 'jspdf';
import {
  BEAD_TYPES,
  diagramScene,
  sceneShapes,
  t,
  type Analysis,
  type Locale,
  type Pattern,
  type Scene,
  type Shape,
} from '../core';
import {
  colourText,
  howToSew,
  instructionsOf,
  metaLine,
  rowEntry,
  type BeadTable,
} from './content';
import { beadRows, cropScene, planDiagram, type DiagramPlan, type Drawing } from './crop';
import { cellBounds, drawShapes, drawText } from './draw';
import {
  BOTTOM,
  CONTENT_H,
  fit,
  GREY,
  M,
  mm,
  need,
  newPage,
  PAGE_H,
  PAGE_W,
  para,
  textWidth,
  WIDTH,
  wrap,
  type Flow,
  type Style,
} from './page';
import { rowList } from './rows';
import { pdfSafe } from './winansi';

/** Input of {@link renderPdf}; `analysis` must be for `pattern`. */
export interface PdfInput {
  readonly pattern: Pattern;
  readonly analysis: Analysis;
  readonly table: BeadTable;
  readonly locale: Locale;
  /** Include the 1:1 preview with scale bar; default `true`. */
  readonly realSize?: boolean;
  /** Deflate content streams; default `true` (tests turn it off to read the text). */
  readonly compress?: boolean;
}

const RULE = '#cccccc';
const TINT = '#e8f0f8';
const NOTE_PT = 7;

function header(f: Flow, i: PdfInput): void {
  const { pattern: p, locale } = i;
  if (p.title.trim()) para(f, p.title.trim(), 18, { style: 'bold', after: 1.5 });
  para(f, metaLine(p, i.analysis, i.table, locale), 9, { color: GREY, after: 2 });
  if (p.description.trim()) para(f, p.description.trim(), 10, { after: 2 });
  f.y += 2;
}

/**
 * Height of the real-size block. At the largest pattern (80 × 120 Delica 11/0, 128 × 156 mm)
 * it stays well inside {@link CONTENT_H}; see the export-pdf tests.
 */
export function realSizeHeight(f: Flow, bare: Scene, p: Pattern, w: number): number {
  const lines = wrap(f.doc, t(f.locale, 'pdf.printNote'), NOTE_PT, w, 'normal').length;
  return 11 + cellBounds(bare, BEAD_TYPES[p.beadType]).h + lines * mm(NOTE_PT) * 1.3;
}

/** Real-size block: label, beads at 1:1, 10 mm scale bar, print note. */
function realSize(f: Flow, bare: Scene, p: Pattern, x: number, y: number, w: number): void {
  const { doc, locale } = f;
  const cb = cellBounds(bare, BEAD_TYPES[p.beadType]);
  drawText(doc, t(locale, 'pdf.realSize'), x, y + 2.5, mm(8), { color: GREY, style: 'bold' });
  drawShapes(doc, sceneShapes(bare), { x0: x - cb.x, y0: y + 5 - cb.y, s: 1 });
  const yb = y + 5 + cb.h + 3;
  doc.setDrawColor('#000000');
  doc.setLineWidth(0.25);
  doc.line(x, yb, x + 10, yb);
  doc.line(x, yb - 1, x, yb + 1);
  doc.line(x + 10, yb - 1, x + 10, yb + 1);
  drawText(doc, t(locale, 'pdf.scale'), x + 12, yb + 1, mm(NOTE_PT), { color: GREY });
  const lines = wrap(doc, t(locale, 'pdf.printNote'), NOTE_PT, w, 'normal');
  const lh = mm(NOTE_PT) * 1.3;
  lines.forEach((l, k) => drawText(doc, l, x, yb + 5.5 + k * lh, mm(NOTE_PT), { color: GREY }));
}

/** Cell box of the beads and slots in `d`. */
function latticeBox(d: Drawing): { x: number; y: number; w: number; h: number } {
  const cells = d.shapes.filter(
    (s): s is Extract<Shape, { t: 'bead' | 'slot' }> => s.t === 'bead' || s.t === 'slot',
  );
  const x0 = Math.min(...cells.map((c) => c.xMm));
  const y0 = Math.min(...cells.map((c) => c.yMm));
  const x1 = Math.max(...cells.map((c) => c.xMm + c.wMm));
  const y1 = Math.max(...cells.map((c) => c.yMm + c.hMm));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function drawDiagram(f: Flow, d: Drawing, p: Pattern, x: number, y: number, s: number): void {
  if (p.mode === 'shaped') {
    const bw = BEAD_TYPES[p.beadType].widthMm;
    const b = latticeBox(d);
    const pad = bw * 0.4;
    f.doc.setFillColor(TINT);
    const [tx, ty] = [x + s * (b.x - pad), y + s * (b.y - pad)];
    f.doc.roundedRect(tx, ty, s * (b.w + 2 * pad), s * (b.h + 2 * pad), s * bw, s * bw, 'F');
  }
  drawShapes(f.doc, d.shapes, { x0: x, y0: y, s });
}

const tableHeight = (rows: number): number => 16 + (rows + 1) * 6;

/** Diagram pages that follow the bead table when the diagram does not fit inline. */
type Deferred = (() => void) | null;

/**
 * Real-size preview and the diagram cropped to the motif (R29): side by side when the motif is
 * narrow; when the inline scale would drop below 2× the diagram gets its own pages, split by rows.
 */
function figures(f: Flow, i: PdfInput): Deferred {
  const { pattern: p, analysis: a, locale } = i;
  const bh = BEAD_TYPES[p.beadType].rowPitchMm;
  const bare = diagramScene(p, a, {});
  const scene = diagramScene(p, a, {
    rowNumbers: true,
    counts: true,
    ladder: true,
    loop: true,
    warnings: true,
    slots: true,
    ladderLabel: t(locale, 'ui.ladderShort'),
  });
  const rows = beadRows(scene, p);
  const full = cropScene(scene, p, rows);
  const show = i.realSize ?? true;
  const realW = cellBounds(bare, BEAD_TYPES[p.beadType]).w;
  const sideW = Math.max(realW, 40);
  const sideH = show ? realSizeHeight(f, bare, p, sideW) : 0;
  const tableH = tableHeight(i.table.rows.length);
  const page = { w: WIDTH, h: CONTENT_H };
  const avail = (w: number, used: number) => ({ w, h: BOTTOM - f.y - used - tableH - 4 });
  const sidePlan: DiagramPlan | null =
    show && realW <= 50
      ? planDiagram(full, rows, bh, avail(Math.min(120, WIDTH - sideW - 10), 0), page)
      : null;
  if (sidePlan?.inline) {
    const h = full.heightMm * sidePlan.s;
    need(f, Math.max(h, sideH));
    realSize(f, bare, p, M, f.y, sideW);
    const areaX = M + sideW + 10;
    drawDiagram(
      f,
      full,
      p,
      areaX + (M + WIDTH - areaX - full.widthMm * sidePlan.s) / 2,
      f.y,
      sidePlan.s,
    );
    f.y += Math.max(h, sideH) + 6;
    return null;
  }
  const realH = show ? realSizeHeight(f, bare, p, WIDTH) : 0;
  const plan = planDiagram(full, rows, bh, avail(Math.min(120, WIDTH), show ? realH + 6 : 0), page);
  if (show) {
    need(f, realH);
    realSize(f, bare, p, M, f.y, WIDTH);
    f.y += realH + 6;
  }
  const at = (d: Drawing, y: number) =>
    drawDiagram(f, d, p, M + (WIDTH - d.widthMm * plan.s) / 2, y, plan.s);
  if (plan.inline) {
    need(f, full.heightMm * plan.s);
    at(full, f.y);
    f.y += full.heightMm * plan.s + 6;
    return null;
  }
  return () => {
    for (const r of plan.pages) {
      newPage(f);
      at(cropScene(scene, p, r), M);
    }
  };
}

function beadTableBlock(f: Flow, i: PdfInput): void {
  const { doc, locale } = f;
  need(f, tableHeight(i.table.rows.length));
  para(f, t(locale, 'pdf.beads'), 12, { style: 'bold', after: 1 });
  const [c1, c2] = [M + 130, M + 160];
  const labelX = M + 7;
  const labelW = c1 - 30 - labelX;
  const small = mm(8);
  const row = (y: number, cells: [string, number, number], style: Style) => {
    drawText(doc, String(cells[1]), c1, y, mm(9), { style, anchor: 'end' });
    drawText(doc, String(cells[2]), c2, y, mm(9), { style, anchor: 'end' });
    drawText(doc, fit(doc, cells[0], 9, labelW, style), labelX, y, mm(9), { style });
  };
  drawText(doc, t(locale, 'pdf.colour'), labelX, f.y + 3, small, { color: GREY });
  drawText(doc, t(locale, 'pdf.perEarring'), c1, f.y + 3, small, { color: GREY, anchor: 'end' });
  drawText(doc, t(locale, 'pdf.perPair'), c2, f.y + 3, small, { color: GREY, anchor: 'end' });
  f.y += 4.5;
  for (const r of i.table.rows) {
    const { label, detail } = colourText(r.color, locale);
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.15);
    doc.line(M, f.y, c2, f.y);
    doc.setFillColor(r.color.hex);
    doc.setDrawColor('#8c8c8c');
    doc.roundedRect(M, f.y + 1.2, 5, 3.6, 0.8, 0.8, 'FD');
    row(f.y + 4.2, [label, r.perEarring, r.perPair], 'normal');
    const used = textWidth(doc, fit(doc, label, 9, labelW), 9) + 2;
    const rest = labelW - used;
    const more = rest >= 12 ? fit(doc, detail, 8, rest) : '';
    if (more) drawText(doc, more, labelX + used, f.y + 4.2, small, { color: GREY });
    f.y += 6;
  }
  doc.setDrawColor(GREY);
  doc.line(M, f.y, c2, f.y);
  row(f.y + 4.2, [t(locale, 'pdf.total'), i.table.total, i.table.totalPair], 'bold');
  f.y += 8;
  para(f, t(locale, 'pdf.buyExtra'), 8.5, { color: GREY });
}

function sewing(f: Flow, i: PdfInput): void {
  const { pattern: p, analysis: a, locale } = i;
  para(f, t(locale, 'pdf.howTo'), 13, { style: 'bold', after: 2 });
  for (const b of howToSew(p, a, locale)) para(f, b, 9.5, { indent: 4, bullet: true, after: 1 });
  f.y += 5;
  need(f, 30);
  para(f, t(locale, 'pdf.rowByRow'), 13, { style: 'bold', after: 2 });
  const order = instructionsOf(a).order;
  const entries = order.map((row) => rowEntry(row, p, locale));
  rowList(f, entries, (e) => {
    const k = entries.indexOf(e);
    return t(locale, 'pdf.rowHeadingCont', { n: order[k]?.rowNumber ?? '' });
  });
}

function footer(doc: jsPDF, locale: Locale): void {
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    const text = t(locale, 'pdf.page', { n, total });
    drawText(doc, text, PAGE_W / 2, PAGE_H - 8, mm(8), { color: GREY, anchor: 'middle' });
  }
}

/**
 * A4 sewing guide (SPEC §8, R14, R15, R27–R29): title and meta, description, real-size preview,
 * enlarged diagram, bead table; then how to sew and the rows in ladder order in three columns;
 * page footer. Throws for an empty pattern.
 */
export async function renderPdf(i: PdfInput): Promise<Uint8Array> {
  instructionsOf(i.analysis);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: i.compress ?? true });
  doc.setProperties({ title: pdfSafe(i.pattern.title) });
  doc.setLanguage(i.locale);
  const f: Flow = { doc, locale: i.locale, y: M };
  header(f, i);
  const later = figures(f, i);
  beadTableBlock(f, i);
  later?.();
  newPage(f);
  sewing(f, i);
  footer(doc, i.locale);
  return new Uint8Array(doc.output('arraybuffer'));
}
