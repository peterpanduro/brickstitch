import { beadTable, type Analysis, type Locale, type Pattern } from '../../core';
import type { PdfInput } from '../../export-pdf';
import type { ChecklistItem } from './checklist';
import { fileSlug } from './file';

/** PDF export choices from the dialog. */
export interface PdfChoice {
  readonly locale: Locale;
  readonly realSize: boolean;
}

/** Renders PDF bytes; injected so the export-pdf chunk can be loaded lazily. */
export type PdfRenderer = (input: PdfInput) => Promise<Uint8Array>;

/** Count and first-row number of loose beads from the checklist, or `null` when there are none. */
export function floatingIssue(items: readonly ChecklistItem[]): { n: number; r: number } | null {
  const p = items.find((i) => i.id === 'floating' && i.kind === 'issue')?.title.params;
  return p ? { n: Number(p.n), r: Number(p.r) } : null;
}

/** Renders the guide for `p` and names it `{slug}.pdf`. */
export async function exportPdf(
  p: Pattern,
  analysis: Analysis,
  choice: PdfChoice,
  render: PdfRenderer,
): Promise<{ name: string; bytes: Uint8Array }> {
  const bytes = await render({ pattern: p, analysis, table: beadTable(p), ...choice });
  return { name: `${fileSlug(p.title)}.pdf`, bytes };
}
