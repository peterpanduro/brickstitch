import { describe, expect, it } from 'vitest';
import {
  analyse,
  BEAD_TYPES,
  beadTable,
  diagramScene,
  type Pattern,
  type Shape,
} from '../src/core';
import { renderPdf } from '../src/export-pdf';
import { howToSew, metaLine } from '../src/export-pdf/content';
import { beadRows, cropScene, MIN_SCALE, planDiagram } from '../src/export-pdf/crop';
import { BOTTOM, CONTENT_H, WIDTH } from '../src/export-pdf/page';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import { pageCount, textPositions } from './pdf-text';
import ripa4 from './fixtures/ripa4_rh.json';

const RIPA4 = fromRhJson(ripa4);
const OPTS = {
  rowNumbers: true,
  counts: true,
  ladder: true,
  loop: true,
  warnings: true,
  slots: true,
};
const LONG = 'Väldigt långt färgnamn som aldrig någonsin tar slut';

/** `w`-wide panel of `h` rows alternating R and B in every row. */
function stripes(w: number, h: number): Pattern {
  const rows = Array.from({ length: h }, (_, r) =>
    Array.from({ length: r % 2 ? w - 1 : w }, (_, i) => (i % 2 ? 'B' : 'R')),
  );
  return fromRowsJson(rows);
}

const cells = (shapes: readonly Shape[]) =>
  shapes.filter(
    (s): s is Extract<Shape, { t: 'bead' | 'slot' }> => s.t === 'bead' || s.t === 'slot',
  );

describe('diagram crop (R29)', () => {
  it('ripa4: lattice width equals the motif width; no slot outside the bead bounds', () => {
    const scene = diagramScene(RIPA4, analyse(RIPA4), OPTS);
    const d = cropScene(scene, RIPA4);
    const latticeW = RIPA4.width * BEAD_TYPES.delica11.widthMm;
    expect(scene.widthMm - d.widthMm).toBeCloseTo(latticeW - 29.6, 6);
    const beads = cells(d.shapes).filter((s) => s.t === 'bead');
    const x0 = Math.min(...beads.map((b) => b.xMm));
    const x1 = Math.max(...beads.map((b) => b.xMm + b.wMm));
    for (const s of cells(d.shapes)) {
      expect(s.xMm).toBeGreaterThanOrEqual(x0 - 1e-6);
      expect(s.xMm + s.wMm).toBeLessThanOrEqual(x1 + 1e-6);
    }
    expect(x1 - x0).toBeCloseTo(29.6 - 0.1 * 1.6, 6);
    expect(d.shapes.filter((s) => s.t === 'text' && s.role === 'rowNumber')).toHaveLength(27);
    expect(cells(d.shapes).some((s) => s.t === 'slot')).toBe(true);
  });

  it('a row range keeps only those rows, shifted to the top', () => {
    const scene = diagramScene(RIPA4, analyse(RIPA4), OPTS);
    const [r0] = beadRows(scene, RIPA4);
    const d = cropScene(scene, RIPA4, [r0 + 5, r0 + 9]);
    const nums = d.shapes.filter((s) => s.t === 'text' && s.role === 'rowNumber');
    expect(nums.map((s) => (s.t === 'text' ? s.text : ''))).toEqual(['6', '7', '8', '9', '10']);
    expect(Math.min(...cells(d.shapes).map((s) => s.yMm))).toBeLessThan(d.topMm + 1.3);
  });
});

describe('diagram plan', () => {
  const page = { w: WIDTH, h: CONTENT_H };
  const bh = BEAD_TYPES.delica11.rowPitchMm;

  it('ripa4 fits inline at ≥ 2×', () => {
    const scene = diagramScene(RIPA4, analyse(RIPA4), OPTS);
    const rows = beadRows(scene, RIPA4);
    const plan = planDiagram(cropScene(scene, RIPA4), rows, bh, { w: 120, h: 180 }, page);
    expect(plan.inline).toBe(true);
    expect(plan.s).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('a tall panel gets own pages at ≥ 2×, split into contiguous row ranges that fit', () => {
    const p = stripes(30, 120);
    const scene = diagramScene(p, analyse(p), OPTS);
    const rows = beadRows(scene, p);
    const d = cropScene(scene, p);
    const plan = planDiagram(d, rows, bh, { w: 120, h: 150 }, page);
    expect(plan.inline).toBe(false);
    expect(plan.s).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.pages[0]?.[0]).toBe(0);
    expect(plan.pages.at(-1)?.[1]).toBe(119);
    plan.pages.forEach(([a, b], k) => {
      if (k > 0) expect(a).toBe((plan.pages[k - 1]?.[1] ?? 0) + 1);
      const slice = cropScene(scene, p, [a, b]);
      expect(slice.heightMm * plan.s).toBeLessThanOrEqual(CONTENT_H + 1e-6);
      expect(slice.widthMm * plan.s).toBeLessThanOrEqual(WIDTH + 1e-6);
    });
  });
});

describe('page bounds', () => {
  it('the largest real-size preview (80 × 120 Delica 11/0) fits a page', () => {
    const t11 = BEAD_TYPES.delica11;
    expect(80 * t11.widthMm).toBeLessThanOrEqual(WIDTH);
    expect(11 + 120 * t11.rowPitchMm + 3 * 3.2).toBeLessThanOrEqual(CONTENT_H);
  });

  it('max-size panel with long colour names: nothing below the bottom margin, entries split and ellipsised', async () => {
    const base = stripes(80, 120);
    const p: Pattern = {
      ...base,
      title: 'Max',
      palette: base.palette.map((e) => ({ ...e, name: `${LONG} ${LONG} ${e.id}` })),
    };
    const bytes = await renderPdf({
      pattern: p,
      analysis: analyse(p),
      table: beadTable(p),
      locale: 'sv',
      compress: false,
    });
    const pos = textPositions(bytes);
    const body = pos.filter((s) => !/^\d+ \/ \d+$/.test(s.text));
    expect(Math.max(...body.map((s) => s.y))).toBeLessThanOrEqual(BOTTOM + 1e-6);
    expect(Math.max(...body.map((s) => s.x))).toBeLessThan(210 - 15);
    const text = pos.map((s) => s.text);
    expect(text).toContain('Rad 1 (forts.)');
    expect(text.some((s) => s.startsWith('1 Väldigt') && s.endsWith('…'))).toBe(true);
    expect(text.some((s) => s.startsWith('Väldigt') && s.endsWith('…'))).toBe(true);
    expect(text.join(' ')).not.toContain(`${LONG} R`);
    expect(pageCount(bytes)).toBeGreaterThan(4);
  }, 30_000);
});

describe('plurals', () => {
  const one: Pattern = { ...shaped(['A']), palette: [{ id: 'A', db: 'DB-200', hex: '#ffffff' }] };

  it('one row, one bead', () => {
    expect(metaLine(one, analyse(one), beadTable(one), 'sv')).toBe(
      'Miyuki Delica 11/0 · 1 rad · ca 1,6×1,3 mm (exkl. ögla/krok) · 1 pärla per örhänge',
    );
    expect(howToSew(one, analyse(one), 'en')[0]).toBe('Sew a ladder of 1 bead.');
  });

  it('reading direction says to read the list from the end on right-to-left rows', () => {
    const b = howToSew(RIPA4, analyse(RIPA4), 'en').join(' ');
    expect(b).toContain('written from left to right');
    expect(b).toContain("read that row's list from the end");
  });
});
