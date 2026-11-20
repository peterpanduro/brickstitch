import {
  BEAD_TYPES,
  beadRect,
  paletteEntryFromSeed,
  SEED_CATALOG,
  type AnalysisTarget,
  type ColorId,
  type AnalysisStats,
  type ImageAnalysis,
  type PaletteEntry,
  type Pattern,
  type PatternMode,
  type ResolvedBackground,
  type Translate,
} from '../../core';
import type { Text } from './checklist';
import type { ImportTarget } from './import-wizard';
import { buildNewPattern } from './new-pattern';
import { nextColorId } from './palette';

/**
 * The pattern the import merges into (SPEC R53): the current pattern from the editor, the blank
 * pattern of the start-page choice otherwise (its palette is the candidate base palette).
 */
export const wizardBase = (target: ImportTarget, current: Pattern): Pattern =>
  target.source === 'editor' ? current : buildNewPattern(target.choice);

/**
 * Whether the catalogue colours start on (SPEC R53): when the base palette has two colours or
 * fewer, since there is little to choose from otherwise.
 */
export const defaultIncludeExtra = (base: Pattern): boolean => base.palette.length <= 2;

/** "Laga automatiskt" lines (SPEC R53 step 4); `null` when the fix is off or does not apply. */
export interface AutoFixReport {
  readonly rings: Text | null;
  readonly despeckle: Text | null;
  readonly prune: Text | null;
}

const NONE: Text = { key: 'wizard.fix.none' };
const count = (n: number, key: 'import.ringsFixed' | 'wizard.fix.removed'): Text =>
  n > 0 ? { key, params: { n } } : NONE;

/** Counts of the last preview as report texts (0 → "Inga hittades"); prune only for shaped. */
export function autoFixReport(
  s: Pick<AnalysisStats, 'ringsReplaced' | 'despeckledBeads' | 'prunedBeads'>,
  on: { readonly fixRings: boolean; readonly despeckle: boolean; readonly autoPrune: boolean },
  mode: PatternMode,
): AutoFixReport {
  return {
    rings: on.fixRings ? count(s.ringsReplaced, 'import.ringsFixed') : null,
    despeckle: on.despeckle ? count(s.despeckledBeads, 'wizard.fix.removed') : null,
    prune: on.autoPrune && mode === 'shaped' ? count(s.prunedBeads, 'wizard.fix.removed') : null,
  };
}

/** Options of {@link candidatePalette}. */
export interface CandidateOptions {
  /** Also offer user-library and seed-catalogue colours not already in the pattern. */
  readonly includeExtra: boolean;
  readonly library: readonly PaletteEntry[];
  /** Detail flag per pattern palette id, overriding the entry's own. */
  readonly detail: Readonly<Record<ColorId, boolean>>;
}

const sameColor = (a: PaletteEntry, b: PaletteEntry): boolean =>
  a.db && b.db ? a.db === b.db : a.hex.toLowerCase() === b.hex.toLowerCase();

const withDetail = (e: PaletteEntry, on: boolean): PaletteEntry => {
  const { detail: _detail, ...rest } = e;
  return on ? { ...rest, detail: true } : rest;
};

/**
 * Palette handed to the analysis: the pattern palette (with detail overrides) first, then, if
 * requested, library and seed colours matching no earlier entry, with ids `lib:<id>`, `seed:<db>`.
 */
export function candidatePalette(p: Pattern, o: CandidateOptions): PaletteEntry[] {
  const out = p.palette.map((e) => withDetail(e, o.detail[e.id] ?? e.detail ?? false));
  if (!o.includeExtra) return out;
  const extras = [
    ...o.library.map((e) => ({ ...e, id: `lib:${e.id}` })),
    ...SEED_CATALOG.map((s) => paletteEntryFromSeed(s, `seed:${s.db}`)),
  ];
  for (const e of extras) if (!out.some((x) => sameColor(x, e))) out.push(e);
  return out;
}

/** Numbers shown under the import preview. */
export interface ImportStats {
  readonly colors: number;
  readonly beads: number;
  readonly pruned: number;
  readonly ms: number;
  /** Background mode the analysis used (what `auto` resolved to). */
  readonly background: ResolvedBackground;
  /** Rings replaced by `fixRings` (R37). */
  readonly ringsFixed: number;
}

/** Colours used, beads placed, pruned beads, ms, background mode and fixed rings of `a`. */
export const importStats = (a: ImageAnalysis, ms: number): ImportStats => ({
  colors: a.usedPalette.length,
  beads: a.pattern.cells.reduce((n, row) => n + row.filter((c) => c !== null).length, 0),
  pruned: a.stats.prunedBeads,
  ms: Math.round(ms),
  background: a.stats.background,
  ringsFixed: a.stats.ringsReplaced,
});

/** Translator of {@link importStatsText} (the editor's `t`). */
export type { Translate };

const lowerFirst = (s: string): string => s.charAt(0).toLocaleLowerCase() + s.slice(1);

/** Stats line under the import preview, with `· {n} rings fixed` when rings were fixed (R37). */
export function importStatsText(s: ImportStats, t: Translate): string {
  const base = t('import.stats', {
    ...s,
    background: lowerFirst(t(`import.bg.${s.background}`)),
  });
  return s.ringsFixed > 0 ? `${base} · ${t('import.ringsFixed', { n: s.ringsFixed })}` : base;
}

/** Bead rectangles (scene mm, lattice origin at `origin`) of the rings `a` replaced (R37). */
export const ringOutline = (
  a: ImageAnalysis,
  origin: { readonly x: number; readonly y: number },
): ReturnType<typeof beadRect>[] =>
  a.stats.rings.flatMap((ring) =>
    ring.cells.map((c) => beadRect({ t: BEAD_TYPES[a.pattern.beadType], origin }, c.r, c.h)),
  );

/**
 * The pattern after importing `a` into `p`: cells, size, mode and bead type from the analysis,
 * ladder reset to auto, title and description kept. Existing palette entries stay (detail flags
 * of used ones follow the candidates); used new colours get fresh `c<n>` ids.
 */
export function mergeImport(p: Pattern, a: ImageAnalysis, target: AnalysisTarget): Pattern {
  const palette = [...p.palette];
  const ids = new Map<ColorId, ColorId>();
  for (const u of a.usedPalette) {
    const i = palette.findIndex((e) => e.id === u.id);
    if (i >= 0) {
      palette[i] = withDetail(palette[i] as PaletteEntry, u.detail === true);
      ids.set(u.id, u.id);
    } else {
      const id = nextColorId({ ...p, palette });
      palette.push({ ...u, id });
      ids.set(u.id, id);
    }
  }
  const cells = a.pattern.cells.map((row) =>
    row.map((c) => (c === null ? null : (ids.get(c) ?? c))),
  );
  return {
    ...p,
    beadType: target.beadType,
    mode: target.mode,
    width: target.width,
    height: target.height,
    palette,
    cells,
    ladder: { kind: 'auto' },
  };
}
