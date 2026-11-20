import { describe, expect, it } from 'vitest';
import { analyse, beadTable, en, sv, type Locale, type Pattern } from '../src/core';
import { renderPdf } from '../src/export-pdf';
import { cellBounds } from '../src/export-pdf/draw';
import { howToSew, metaLine, rowEntry, colourText } from '../src/export-pdf/content';
import { pdfSafe } from '../src/export-pdf/winansi';
import { BEAD_TYPES, diagramScene } from '../src/core';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import { pageCount, pdfStrings } from './pdf-text';
import liten from './fixtures/liten.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

const RIPA4 = { ...fromRhJson(ripa4), title: 'Fjällripa' };
const LITEN = { ...fromRowsJson(liten), title: 'Liten flagga' };
const FORBIDDEN = /bild|image|förlaga|generated/i;

async function render(p: Pattern, locale: Locale, realSize = true) {
  const bytes = await renderPdf({
    pattern: p,
    analysis: analyse(p),
    table: beadTable(p),
    locale,
    realSize,
    compress: false,
  });
  return { bytes, text: pdfStrings(bytes).join('\n') };
}

describe('renderPdf', () => {
  it('ripa4 sv: %PDF, sensible pages, rows, DB numbers, totals, no source wording', async () => {
    const { bytes, text } = await render(RIPA4, 'sv');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    expect(pageCount(bytes)).toBeLessThanOrEqual(3);
    for (const s of ['Fjällripa', 'Rad 1 (', 'Rad 18 (15)', 'Rad 27 (', 'DB-200', 'DB-010'])
      expect(text).toContain(s);
    for (const s of ['DB-1139', '268', '536', '29,6×35,1 mm', 'Så syr du', '· lucka ·'])
      expect(text).toContain(s);
    expect(text).toContain('Skriv ut i 100 %');
    expect(text).toMatch(/1 \/ \d/);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('ripa4 en: English strings, no source wording', async () => {
    const { text } = await render(RIPA4, 'en');
    for (const s of ['Row 1 (', 'Row 18 (15)', '29.6×35.1 mm', 'How to sew', '· gap ·', '268'])
      expect(text).toContain(s);
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toContain('Rad ');
  });

  it('liten panel: alternating counts, totals, two to three pages', async () => {
    const { bytes, text } = await render(LITEN, 'sv');
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    expect(pageCount(bytes)).toBeLessThanOrEqual(3);
    for (const s of ['växelvis 11 och 10 pärlor per rad', '231', '462', 'Rad 22 (10)', 'DB-723'])
      expect(text).toContain(s);
    expect(text).not.toMatch(/öka 1 vänster/);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('omits the real-size preview on request', async () => {
    const { text } = await render(RIPA4, 'en', false);
    expect(text).not.toContain('100 %');
  });

  it('renders user names with non-WinAnsi glyphs without garbling the line', async () => {
    const p = { ...LITEN, palette: LITEN.palette.map((e, i) => (i ? e : { ...e, name: 'Röd≈x' })) };
    const { text } = await render(p, 'sv');
    expect(text).toContain('Röd~x');
  });

  it('rejects an empty pattern', async () => {
    const p = shaped(['...', '..']);
    await expect(
      renderPdf({ pattern: p, analysis: analyse(p), table: beadTable(p), locale: 'sv' }),
    ).rejects.toThrow();
  });
});

describe('content', () => {
  it('meta line: bead type, rows, panel alternation, size, beads per earring', () => {
    const a = analyse(LITEN);
    expect(metaLine(LITEN, a, beadTable(LITEN), 'sv')).toBe(
      'Miyuki Delica 11/0 · 22 rader · växelvis 11 och 10 pärlor per rad · ca 17,6×28,6 mm (exkl. ögla/krok) · 231 pärlor per örhänge',
    );
    expect(metaLine(RIPA4, analyse(RIPA4), beadTable(RIPA4), 'en')).toBe(
      'Miyuki Delica 11/0 · 27 rows · approx. 29.6×35.1 mm (excl. loop/hook) · 268 beads per earring',
    );
  });

  it('colour text: D2 label plus localised seed name when it differs', () => {
    const w = RIPA4.palette.find((e) => e.db === 'DB-200');
    expect(w && colourText(w, 'sv')).toEqual({ label: 'DB-200', detail: 'Vit' });
    expect(w && colourText({ ...w, name: 'Snö' }, 'en')).toEqual({
      label: 'Snö',
      detail: 'DB-200 White',
    });
  });

  it('how to sew: shaped ripa4 has ladder, notes, parts, loop, reading and mirror bullets', () => {
    const b = howToSew(RIPA4, analyse(RIPA4), 'sv');
    expect(b[0]).toContain('rad 18 (15 pärlor)');
    expect(b[0]).toContain('rad 27');
    expect(b.join(' ')).toContain('Hoppa in');
    expect(b.join(' ')).toContain('flera delar');
    expect(b.join(' ')).toMatch(/öglan .* rad \d+\./);
    expect(b.at(-1)).toContain('spegelvänd');
  });

  it('how to sew: panel gets the general increase instruction (R14), not edge notes', () => {
    const b = howToSew(LITEN, analyse(LITEN), 'en');
    expect(b[0]).toMatch(/^Row 1 is a ladder of 11 beads/);
    expect(b.join(' ')).toContain('increase by one bead at each edge');
    expect(b.join(' ')).not.toContain('Step in');
    expect(b.join(' ')).not.toContain('several parts');
  });

  it('how to sew: extra-ladder and floating bullets only when present', () => {
    const p: Pattern = {
      ...shaped(['AAAAA', '.AAA', '.....', '....', '....A']),
      ladder: { kind: 'manual', row: 1 },
    };
    const all = howToSew(p, analyse(p), 'en').join(' ');
    expect(all).toContain('extra ladder');
    expect(all).toContain('red cross');
    const ripa = howToSew(RIPA4, analyse(RIPA4), 'en').join(' ');
    expect(ripa).not.toContain('extra ladder');
    expect(ripa).not.toContain('red cross');
  });

  it('row entry: heading, notes, runs labelled per D2, gap between segments', () => {
    const a = analyse(RIPA4);
    const row = a.instructions?.order.find((r) => r.rowNumber === 25);
    const e = row && rowEntry(row, RIPA4, 'sv');
    expect(e?.heading).toBe(`Rad 25 (${row?.count})`);
    expect(e?.notes).toContain('delar – sy varje del för sig');
    expect(e?.tokens.filter((t) => t.kind === 'gap').map((t) => t.text)).toEqual([
      '· lucka ·',
      '· lucka ·',
    ]);
    expect(e?.tokens[0]).toMatchObject({ kind: 'run', label: expect.stringMatching(/^DB-/) });
  });
});

describe('real size', () => {
  it('cell bounds of the bare scene are the pattern extent: ripa4 29.6 × 35.1 mm', () => {
    const b = cellBounds(diagramScene(RIPA4, analyse(RIPA4), {}), BEAD_TYPES.delica11);
    expect(b.w).toBeCloseTo(29.6, 6);
    expect(b.h).toBeCloseTo(35.1, 6);
  });
});

describe('WinAnsi', () => {
  it('keeps Swedish letters and typographic marks, replaces the rest', () => {
    expect(pdfSafe('åäöÅÄÖé – · × • ½')).toBe('åäöÅÄÖé – · × • ½');
    expect(pdfSafe('≈ ⁄ ≥ 🙂!')).toBe('~ / >= !');
  });

  it('every PDF message is WinAnsi-safe', () => {
    for (const cat of [sv, en])
      for (const [k, v] of Object.entries(cat))
        if (k.startsWith('pdf.') || k.startsWith('note.') || k.startsWith('side.'))
          expect(pdfSafe(v), k).toBe(v);
  });
});
