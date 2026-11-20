import {
  parsePatternFile,
  type AnalysisTarget,
  type ImageAnalysis,
  type ParseError,
  type Pattern,
  type Warning,
  type WarningCode,
} from '../../core';
import { applyEdit, current, type EditorState } from './editor';
import { mergeImport } from './import-merge';
import { buildNewPattern, type NewPatternChoice } from './new-pattern';
import { addColor, type ColorSpec } from './palette';
import { warningAt } from './warnings';

/** Unsaved when the pattern differs from the last saved/created one (`null` = never saved). */
export const isDirty = (saved: Pattern | null, p: Pattern): boolean => saved !== p;

/** New must confirm when work would be replaced or unreadable stored data would be overwritten. */
export const newNeedsConfirm = (s: { dirty: boolean; loadError: boolean }): boolean =>
  s.dirty || s.loadError;

/** Replaces the pattern with a blank one as one undo step. */
export const startNewPattern = (s: EditorState, c: NewPatternChoice): EditorState =>
  applyEdit(s, () => buildNewPattern(c));

/** Opens `.brickstitch.json` text as one undo step; on failure returns `s` and the error. */
export function openText(
  s: EditorState,
  text: string,
): { state: EditorState; error: ParseError | null } {
  const r = parsePatternFile(text);
  return r.ok
    ? { state: applyEdit(s, () => r.pattern), error: null }
    : { state: s, error: r.error };
}

/** Replaces cells (and size, mode, bead type) with an image analysis and merges its palette, as one undo step. */
export const applyImport = (
  s: EditorState,
  a: ImageAnalysis,
  target: AnalysisTarget,
): EditorState => applyEdit(s, (p) => mergeImport(p, a, target));

/**
 * A new pattern from an image picked on the start page (SPEC R53): the blank pattern of
 * `choice` with the analysis merged in, as one undo step back to the previous pattern.
 */
export const newFromImport = (
  s: EditorState,
  c: NewPatternChoice,
  a: ImageAnalysis,
  target: AnalysisTarget,
): EditorState => applyEdit(s, () => mergeImport(buildNewPattern(c), a, target));

/** Pending "Visa" request from another view (SPEC R48); `null` when none. */
export type ShowWarningRequest = WarningCode | null;

/** Takes the pending request: returns its code once and the cleared request. */
export const consumeShowWarningRequest = (
  r: ShowWarningRequest,
): { code: ShowWarningRequest; next: null } => ({ code: r, next: null });

/**
 * Whether the editor holds a pattern worth continuing (SPEC R55): restored by autosave (pass
 * `restored` false for a restored untouched starter, see `isStarter`) or edited/opened/created
 * this session; not the untouched starter or the starter after a load error.
 */
export const hasRealPattern = (s: {
  restored: boolean;
  loadError: boolean;
  touched: boolean;
}): boolean => s.touched || (s.restored && !s.loadError);

/** Adds a colour (reusing one with the same DB number) and selects it. */
export function addColorAndSelect(s: EditorState, spec: ColorSpec): EditorState {
  const r = addColor(current(s), spec);
  const next = applyEdit(s, () => r.pattern);
  return { ...next, color: r.id };
}

/** Per-code position in the warning list, valid for the warnings it was built from. */
export interface WarningCycle {
  readonly key: string;
  readonly next: Partial<Record<WarningCode, number>>;
}

/** Cycle with no history. */
export const emptyCycle = (): WarningCycle => ({ key: '', next: {} });

/** Cell (or whole row, `h: null`) to highlight. */
export interface Focus {
  readonly r: number;
  readonly h: number | null;
}

/** Focuses the next warning of `code`; the cycle restarts when `warnings` change. */
export function cycleWarning(
  c: WarningCycle,
  warnings: readonly Warning[],
  code: WarningCode,
): { cycle: WarningCycle; focus: Focus | null } {
  const key = JSON.stringify(warnings);
  const next = key === c.key ? c.next : {};
  const n = next[code] ?? 0;
  const w = warningAt(warnings, code, n);
  return {
    cycle: { key, next: { ...next, [code]: n + 1 } },
    focus: w ? { r: w.r, h: 'h' in w ? w.h : null } : null,
  };
}
