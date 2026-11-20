import type { jsPDF } from 'jspdf';
import type { RowEntry, RowToken } from './content';
import { drawText } from './draw';
import {
  BOTTOM,
  CONTENT_H,
  fit,
  GREY,
  M,
  mm,
  newPage,
  textWidth,
  WIDTH,
  wrap,
  type Flow,
} from './page';

const COL_GAP = 6;
/** Width of one of the three row-list columns. */
export const COL_W = (WIDTH - 2 * COL_GAP) / 3;
const NOTE = '#a0522d';
const HEAD = 4;
const NOTE_H = mm(7.5) * 1.3;
const RUN_H = 3.9;
const SWATCH = 3;
const SPACE = 1.6;
const ENTRY_GAP = 2.5;

/** One line of a row entry below its heading. */
interface Line {
  readonly h: number;
  readonly draw: (x: number, y: number) => void;
}

/** A run token laid out: ellipsised label, width including swatch. */
function placeToken(doc: jsPDF, tok: RowToken): { text: string; w: number; tok: RowToken } {
  if (tok.kind === 'gap') return { text: tok.text, w: textWidth(doc, tok.text, 8), tok };
  const n = `${tok.count} `;
  const label = fit(doc, tok.label, 8, COL_W - SWATCH - textWidth(doc, n, 8));
  const text = n + label;
  return { text, w: SWATCH + textWidth(doc, text, 8), tok };
}

/** Note lines and wrapped run lines of `e`, each fitting {@link COL_W}. */
function entryLines(doc: jsPDF, e: RowEntry): Line[] {
  const notes = e.notes ? wrap(doc, e.notes, 7.5, COL_W, 'italic') : [];
  const out: Line[] = notes.map((l) => ({
    h: NOTE_H,
    draw: (x, y) =>
      drawText(doc, l, x, y + NOTE_H * 0.8, mm(7.5), { style: 'italic', color: NOTE }),
  }));
  const lines: { x: number; p: ReturnType<typeof placeToken> }[][] = [[]];
  let x = 0;
  for (const p of e.tokens.map((t) => placeToken(doc, t))) {
    if (x > 0 && x + p.w > COL_W) {
      x = 0;
      lines.push([]);
    }
    lines[lines.length - 1]?.push({ x, p });
    x += p.w + SPACE;
  }
  for (const line of lines) {
    out.push({
      h: RUN_H,
      draw: (x0, y) => {
        for (const { x: dx, p } of line) {
          if (p.tok.kind === 'gap') {
            drawText(doc, p.text, x0 + dx, y + 2.9, mm(8), { color: GREY });
            continue;
          }
          doc.setFillColor(p.tok.fill);
          doc.setDrawColor('#8c8c8c');
          doc.setLineWidth(0.1);
          doc.roundedRect(x0 + dx, y + 0.6, 2.2, 2.6, 0.5, 0.5, 'FD');
          drawText(doc, p.text, x0 + dx + SWATCH, y + 2.9, mm(8));
        }
      },
    });
  }
  return out;
}

/**
 * Row entries in three columns from the cursor (SPEC §8.7). An entry moves to the next column
 * (or page) when it does not fit; one taller than a whole column is split, continuing under
 * `cont(entry)`. Nothing is drawn below {@link BOTTOM}.
 */
export function rowList(
  f: Flow,
  entries: readonly RowEntry[],
  cont: (e: RowEntry) => string,
): void {
  const { doc } = f;
  let [col, top] = [0, f.y];
  const nextCol = (): void => {
    col++;
    if (col === 3) {
      newPage(f);
      [col, top] = [0, M];
    }
    f.y = top;
  };
  const head = (text: string): void => {
    drawText(doc, text, M + col * (COL_W + COL_GAP), f.y + 3, mm(8.5), { style: 'bold' });
    f.y += HEAD;
  };
  for (const e of entries) {
    const lines = entryLines(doc, e);
    const total = HEAD + lines.reduce((s, l) => s + l.h, 0);
    const firstH = HEAD + (lines[0]?.h ?? 0);
    if (f.y > top && f.y + total > BOTTOM && (total <= CONTENT_H || f.y + firstH > BOTTOM)) {
      nextCol();
    }
    head(e.heading);
    for (const l of lines) {
      if (f.y + l.h > BOTTOM) {
        nextCol();
        head(cont(e));
      }
      l.draw(M + col * (COL_W + COL_GAP), f.y);
      f.y += l.h;
    }
    f.y += ENTRY_GAP;
  }
}
