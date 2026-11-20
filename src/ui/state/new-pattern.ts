import {
  BEAD_TYPES,
  createPattern,
  paletteEntryFromSeed,
  rowLength,
  seedByDb,
  type BeadTypeId,
  type Pattern,
  type PatternMode,
} from '../../core';
import type { ImportTarget } from './import-wizard';
import { matchingPreset, sizePresets, type SizePresetId } from './presets';

/** Default canvas per mode (SPEC §10). */
export const defaultSize = (mode: PatternMode): { width: number; height: number } =>
  mode === 'panel' ? { width: 11, height: 22 } : { width: 20, height: 28 };

/** Physical size of a `W × H` canvas for every bead type. */
export function sizeReadout(
  width: number,
  height: number,
): Record<BeadTypeId, { width: number; height: number }> {
  const size = (id: BeadTypeId) => ({
    width: width * BEAD_TYPES[id].widthMm,
    height: height * BEAD_TYPES[id].rowPitchMm,
  });
  return { delica11: size('delica11'), delica15: size('delica15') };
}

/** Choices of the New-pattern dialog. */
export interface NewPatternChoice {
  readonly beadType: BeadTypeId;
  readonly mode: PatternMode;
  readonly width: number;
  readonly height: number;
  /** DB number of the panel background seed colour. */
  readonly background: string;
}

const WHITE = 'DB-200';
const BLACK = 'DB-010';

/** Blank pattern with palette `[background, black or white]`; panels are filled. */
export function buildNewPattern(c: NewPatternChoice): Pattern {
  const contrast = c.background === BLACK ? WHITE : BLACK;
  const palette = [c.background, contrast].flatMap((db, i) => {
    const seed = seedByDb(db);
    return seed ? [paletteEntryFromSeed(seed, `c${i + 1}`)] : [];
  });
  return createPattern({ ...c, palette, fill: palette[0]?.id ?? null });
}

/** The pattern the editor starts with when nothing is stored: a medium white panel. */
export const starterPattern = (): Pattern =>
  buildNewPattern({
    beadType: 'delica11',
    mode: 'panel',
    ...defaultSize('panel'),
    background: WHITE,
  });

const sortKeys = (_k: string, v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
    : v;

const canonical = (p: Pattern): string => JSON.stringify(p, sortKeys);

/** Whether `p` equals the untouched {@link starterPattern} (e.g. autosaved on a first visit). */
export const isStarter = (p: Pattern): boolean => canonical(p) === canonical(starterPattern());

/** "Hur vill du börja?" on the start page (SPEC R55). */
export type StartMethod = 'draw' | 'image';

/** Start-page state kept by the app for the session (survives an import cancel, SPEC R55). */
export interface StartState {
  method: StartMethod;
  choice: NewPatternChoice;
}

/** Slider ranges in beads (width) and rows (height). */
export const SIZE_LIMITS = {
  width: { min: 2, max: 80 },
  height: { min: 1, max: 120 },
} as const;

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(n)));

/** Physical size in mm of the chosen canvas for the chosen bead type. */
export function choiceSizeMm(c: NewPatternChoice): { width: number; height: number } {
  return sizeReadout(c.width, c.height)[c.beadType];
}

/** Bead count of the chosen canvas: exact for panels, an upper bound for shaped patterns. */
export function beadEstimate(c: NewPatternChoice): { count: number; exact: boolean } {
  let count = 0;
  for (let r = 0; r < c.height; r++) count += rowLength(c.width, r);
  return { count, exact: c.mode === 'panel' };
}

/** Applies a size preset of the current mode. */
export function withPreset(c: NewPatternChoice, id: SizePresetId): NewPatternChoice {
  const p = sizePresets(c.mode).find((x) => x.id === id);
  return p ? { ...c, width: p.width, height: p.height } : c;
}

/**
 * Switches the pattern mode: a preset size keeps its tier (Stor stays Stor) in the new mode;
 * a custom size stays as it is, clamped to the size limits.
 */
export function withMode(c: NewPatternChoice, mode: PatternMode): NewPatternChoice {
  const tier = activePreset(c);
  const next = { ...c, mode };
  return tier ? withPreset(next, tier) : withSize(next, {});
}

/** Sets width and/or height (beads, rows), rounded and clamped to {@link SIZE_LIMITS}. */
export const withSize = (
  c: NewPatternChoice,
  s: { width?: number; height?: number },
): NewPatternChoice => ({
  ...c,
  width: clamp(s.width ?? c.width, SIZE_LIMITS.width.min, SIZE_LIMITS.width.max),
  height: clamp(s.height ?? c.height, SIZE_LIMITS.height.min, SIZE_LIMITS.height.max),
});

/** Space for the start page's real-size preview, in CSS mm. */
export const START_PREVIEW_BOX = { width: 100, height: 110 } as const;

/** Id of the size preset equal to the current size; `null` ("Egen") when none matches. */
export const activePreset = (c: NewPatternChoice): SizePresetId | null =>
  matchingPreset(sizePresets(c.mode), c);

/** Import target for "Börja från en bild": the page's choices travel with the image (R53). */
export const importTarget = (s: StartState): ImportTarget => ({
  source: 'start',
  choice: s.choice,
});

/** An action of the start page that replaces the current pattern. */
export type StartAction<F> =
  { kind: 'create' } | { kind: 'pick'; pick: 'image' | 'file' } | { kind: 'drop'; file: F };

/** Start-page confirmation state: the action waiting for "Ersätt", if any. */
export interface StartFlow<F> {
  pending: StartAction<F> | null;
}

/** Runs `action` at once, or parks it for confirmation when the pattern needs it (R55). */
export function requestAction<F>(
  flow: StartFlow<F>,
  action: StartAction<F>,
  needsConfirm: boolean,
): { flow: StartFlow<F>; run: StartAction<F> | null } {
  return needsConfirm
    ? { flow: { pending: action }, run: null }
    : { flow: { pending: null }, run: action };
}

/** Releases the parked action for running; a no-op when nothing waits. */
export const confirmPending = <F>(
  flow: StartFlow<F>,
): { flow: StartFlow<F>; run: StartAction<F> | null } => ({
  flow: { pending: null },
  run: flow.pending,
});

/** Drops the parked action. */
export const cancelPending = <F>(flow: StartFlow<F>): StartFlow<F> => ({ ...flow, pending: null });

/** Start-page defaults: draw a medium white panel. */
export const initialStartState = (): StartState => ({
  method: 'draw',
  choice: { beadType: 'delica11', mode: 'panel', ...defaultSize('panel'), background: WHITE },
});
