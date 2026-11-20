import {
  colourLabel,
  formatMm,
  formatNote,
  rowNumbers,
  seedName,
  t,
  type Analysis,
  type Instructions,
  type Locale,
  type PaletteEntry,
  type Pattern,
  type RowInstruction,
  type beadTable,
} from '../core';

/** Bead table as returned by `beadTable`. */
export type BeadTable = ReturnType<typeof beadTable>;

/** One piece of a written row: a run `3 DB-200` with its bead colour, or a segment gap. */
export type RowToken =
  | { readonly kind: 'run'; readonly count: number; readonly label: string; readonly fill: string }
  | { readonly kind: 'gap'; readonly text: string };

/** Written row: heading `Rad k (count)`, joined notes and run tokens. */
export interface RowEntry {
  readonly heading: string;
  readonly notes: string;
  readonly tokens: readonly RowToken[];
}

/** Instructions of `a`; throws for an empty pattern, which has none. */
export function instructionsOf(a: Analysis): Instructions {
  if (!a.instructions) throw new Error('empty pattern');
  return a.instructions;
}

/** Meta line under the title (SPEC §8.1): bead, rows, panel alternation, size, beads. */
export function metaLine(p: Pattern, a: Analysis, table: BeadTable, locale: Locale): string {
  const ins = instructionsOf(a);
  return [
    t(locale, 'pdf.meta.bead', { bead: t(locale, `bead.${p.beadType}`) }),
    t(locale, 'pdf.meta.rows', { n: ins.order.length }),
    ...(p.mode === 'panel' ? [t(locale, 'pdf.meta.panel', { a: p.width, b: p.width - 1 })] : []),
    t(locale, 'pdf.meta.size', {
      w: formatMm(locale, ins.sizeMm.width),
      h: formatMm(locale, ins.sizeMm.height),
    }),
    t(locale, 'pdf.meta.beadsPerEarring', { n: table.total }),
  ].join(' · ');
}

/**
 * Bead table text (SPEC D2): `label` is the user name, else the DB number; `detail` adds the DB
 * number under a user name, the localised seed name when it differs, and the finish.
 */
export function colourText(e: PaletteEntry, locale: Locale): { label: string; detail: string } {
  const label = colourLabel(e, locale);
  const seed = e.db ? seedName(e.db, locale) : undefined;
  const detail = [e.name ? e.db : undefined, seed !== label ? seed : undefined, e.finish]
    .filter((s): s is string => !!s)
    .join(' ');
  return { label, detail };
}

function ladderBullet(ins: Instructions, locale: Locale): string {
  const first = ins.order[0] as RowInstruction;
  const last = ins.order.length;
  const n = first.rowNumber;
  const p = { row: n, n: first.count, next: n + 1, last };
  if (last === 1) return t(locale, 'pdf.sew.ladderOnly', p);
  if (n === 1) return t(locale, 'pdf.sew.ladderTop', p);
  if (n === last) return t(locale, 'pdf.sew.ladderBottom', p);
  return t(locale, 'pdf.sew.ladderMiddle', p);
}

/**
 * "How to sew" bullets (SPEC §8.6, R14, R15): ladder and direction, panel increase rule or
 * note meanings, extra ladder, unsupported beads, parts, loop, reading direction, mirror tip.
 */
export function howToSew(p: Pattern, a: Analysis, locale: Locale): string[] {
  const ins = instructionsOf(a);
  const kinds = new Set(ins.order.flatMap((r) => r.notes.map((n) => n.kind)));
  const many = ins.order.length > 1;
  const loopRow = ins.loop ? rowNumbers(p)[ins.loop.r] : null;
  const out = [ladderBullet(ins, locale)];
  if (many && p.mode === 'panel')
    out.push(t(locale, 'pdf.sew.panel', { a: p.width, b: p.width - 1 }));
  if (many && p.mode === 'shaped') out.push(t(locale, 'pdf.sew.shaped'));
  if (kinds.has('extraLadder')) out.push(t(locale, 'pdf.sew.extraLadder'));
  if (a.warnings.some((w) => w.code === 'floating')) out.push(t(locale, 'pdf.sew.floating'));
  if (kinds.has('parts')) out.push(t(locale, 'pdf.sew.parts'));
  if (loopRow) out.push(t(locale, 'pdf.sew.loop', { n: loopRow }));
  out.push(t(locale, 'pdf.sew.reading'), t(locale, 'pdf.sew.mirror'));
  return out;
}

/** Written form of one row (SPEC §8.7): runs labelled per D2, gaps between segments. */
export function rowEntry(row: RowInstruction, p: Pattern, locale: Locale): RowEntry {
  const byId = new Map(p.palette.map((e) => [e.id, e]));
  const gap = t(locale, 'note.gap');
  return {
    heading: t(locale, 'pdf.rowHeading', { n: row.rowNumber, count: row.count }),
    notes: row.notes.map((n) => formatNote(locale, n)).join(', '),
    tokens: row.segments.flatMap((seg, i): RowToken[] => [
      ...(i > 0 ? [{ kind: 'gap' as const, text: gap }] : []),
      ...seg.map((run): RowToken => {
        const e = byId.get(run.color);
        const label = e ? colourLabel(e, locale) : run.color;
        return { kind: 'run', count: run.length, label, fill: e?.hex ?? '#888888' };
      }),
    ]),
  };
}
