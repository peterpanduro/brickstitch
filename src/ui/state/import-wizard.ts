import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type AutoSize,
  type BeadTypeId,
  type MessageKey,
  type Pattern,
  type PatternMode,
} from '../../core';
import { formToSettings, settingsToForm, type ImportForm } from './import-settings';
import type { NewPatternChoice } from './new-pattern';
import {
  DETAIL_PRESETS,
  SIZE_PRESET_IDS,
  sizePresets,
  type DetailPreset,
  type SizePreset,
  type SizePresetId,
} from './presets';

/**
 * Where "Mönster från bild" was opened from (SPEC R53): the editor (import into the current
 * pattern) or the start page with its choices (a new pattern).
 */
export type ImportTarget =
  { readonly source: 'editor' } | { readonly source: 'start'; readonly choice: NewPatternChoice };

/** Wizard steps in order: Beskär, Bakgrund, Färger, Detaljer, Klart. */
export const WIZARD_STEPS = ['crop', 'background', 'colours', 'details', 'done'] as const;

/** One wizard step. */
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Current step and the steps visited so far (in visiting order). */
export interface StepState {
  readonly step: WizardStep;
  readonly visited: readonly WizardStep[];
}

/** The wizard opens on Beskär. */
export const initialSteps = (): StepState => ({ step: 'crop', visited: ['crop'] });

/** `s` on `step`, which is added to the visited steps. */
export const goTo = (s: StepState, step: WizardStep): StepState => ({
  step,
  visited: s.visited.includes(step) ? s.visited : [...s.visited, step],
});

const offset = (s: StepState, d: number): StepState => {
  const i = WIZARD_STEPS.indexOf(s.step) + d;
  const step = WIZARD_STEPS[i];
  return step ? goTo(s, step) : s;
};

/** The following step (`s` itself on the last). */
export const nextStep = (s: StepState): StepState => offset(s, 1);

/** The previous step (`s` itself on the first). */
export const prevStep = (s: StepState): StepState => offset(s, -1);

/** What the picture card shows: the original, the background cutout, or the processed colours. */
export type PictureView = 'original' | 'cutout' | 'processed';

/** The Original / Processed toggle value; `null` until the user touches it. */
export type ViewChoice = 'original' | 'processed' | null;

/**
 * The picture view of `step` (SPEC R39, R53): until the user chooses, the original on Beskär,
 * the background cutout on Bakgrund and the processed colours from Färger on; a choice sticks,
 * "processed" on Bakgrund being the cutout.
 */
export function pictureView(step: WizardStep, chosen: ViewChoice): PictureView {
  if (chosen === 'original') return 'original';
  if (step === 'background') return 'cutout';
  if (chosen === 'processed') return 'processed';
  return step === 'crop' ? 'original' : 'processed';
}

/** Phone pane: the picture while cropping and removing the background, the beads after (R53). */
export const defaultPane = (step: WizardStep): 'picture' | 'beads' =>
  step === 'crop' || step === 'background' ? 'picture' : 'beads';

/** Colour counter of step 3 against the candidate palette size. */
export interface ColourCount {
  /** `maxColors` clamped to {@link max}. */
  readonly shown: number;
  /** Highest choosable count: 8, or fewer when there are fewer candidates. */
  readonly max: number;
  /** There are fewer candidates than `maxColors`. */
  readonly limited: boolean;
}

/** Counter value for `maxColors` among `candidates` colours (SPEC R53 step 3). */
export function colourCount(maxColors: number, candidates: number): ColourCount {
  const max = Math.min(8, candidates);
  return { shown: Math.min(maxColors, max), max, limited: candidates < maxColors };
}

/** Whether the stepper shows `step` as done: visited and not the current step. */
export const stepDone = (s: StepState, step: WizardStep): boolean =>
  step !== s.step && s.visited.includes(step);

/**
 * Why "Använd mönstret" is disabled, as a status message key (invalid size, analysis running,
 * failed, empty result); `null` when the result can be applied.
 */
export function applyBlock(s: {
  readonly valid: boolean;
  readonly working: boolean;
  readonly failed: boolean;
  readonly empty: boolean;
}): MessageKey | null {
  if (!s.valid) return 'import.invalid';
  if (s.working) return 'import.working';
  if (s.failed) return 'import.failed';
  if (s.empty) return 'import.empty';
  return null;
}

/** Initial target lattice and form of the wizard. */
export interface WizardInit {
  readonly beadType: BeadTypeId;
  readonly mode: PatternMode;
  readonly width: number;
  readonly height: number;
  readonly form: ImportForm;
}

/**
 * Initial wizard values (SPEC R53): from the editor, the current pattern's bead type, mode and
 * size; from the start page, the choice with `autoSize: null`. The form starts from `saved`.
 */
export function initialWizard(
  target: ImportTarget,
  pattern: Pattern,
  saved: AnalysisSettings,
): WizardInit {
  const form = settingsToForm(saved);
  if (target.source === 'editor')
    return {
      beadType: pattern.beadType,
      mode: pattern.mode,
      width: pattern.width,
      height: pattern.height,
      form,
    };
  const { beadType, mode, width, height } = target.choice;
  return { beadType, mode, width, height, form: { ...form, autoSize: null } };
}

/** Settings written on "Använd mönstret": the form over `saved` (R33). */
export const savedSettings = (form: ImportForm, saved: AnalysisSettings): AnalysisSettings =>
  formToSettings(form, saved);

/**
 * Settings the preview runs with: {@link savedSettings}, and for a panel from the start page
 * `panelBackground` = the Grundfärg entry of `base` (its first palette entry; this import only).
 */
export function runSettings(
  form: ImportForm,
  saved: AnalysisSettings,
  target: ImportTarget,
  base: Pattern,
  mode: PatternMode,
): AnalysisSettings {
  const s = savedSettings(form, saved);
  const grund = base.palette[0]?.id;
  return target.source === 'start' && mode === 'panel' && grund
    ? { ...s, panelBackground: grund }
    : s;
}

/** Width and `autoSize: 'height'` of a size preset (R52.8 in import). */
export const sizePresetPatch = (p: SizePreset): { width: number; autoSize: 'height' } => ({
  width: p.width,
  autoSize: 'height',
});

/** Width × height in beads. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Size bar selection: the preset whose width equals the width while the height is automatic,
 * or whose width and height both equal a manual size (e.g. a start-page choice); "Egen"
 * otherwise or when `custom` (the user opened the fields).
 */
export function selectedSizePreset(
  mode: PatternMode,
  size: Size,
  autoSize: AutoSize,
  custom: boolean,
): SizePresetId | 'custom' {
  if (custom || autoSize === 'width') return 'custom';
  const hit = sizePresets(mode).find(
    (p) => p.width === size.width && (autoSize === 'height' || p.height === size.height),
  );
  return hit?.id ?? 'custom';
}

/**
 * Size patch when the mode changes: a selected preset stays selected for the new mode (width
 * with automatic height, or both sides for a manual size).
 */
export function modeSwitchPatch(
  mode: PatternMode,
  size: Size,
  autoSize: AutoSize,
  custom: boolean,
  next: PatternMode,
): { width?: number; height?: number; autoSize?: 'height' } {
  const id = selectedSizePreset(mode, size, autoSize, custom);
  const p = sizePresets(next)[SIZE_PRESET_IDS.indexOf(id as SizePresetId)];
  if (!p) return {};
  return autoSize === 'height' ? sizePresetPatch(p) : { width: p.width, height: p.height };
}

/**
 * Settings written on Apply (R33): {@link savedSettings}, except that from the start page the
 * stored `autoSize` is kept unless the size was changed in the wizard (`sizeChanged`), since
 * the wizard starts that import with `autoSize: null`.
 */
export function appliedSettings(
  form: ImportForm,
  saved: AnalysisSettings,
  target: ImportTarget,
  sizeChanged: boolean,
): AnalysisSettings {
  const s = savedSettings(form, saved);
  return target.source === 'start' && !sizeChanged ? { ...s, autoSize: saved.autoSize } : s;
}

/** Keys of `keys` without a cached thumbnail, in order. */
export const thumbMisses = (
  keys: readonly string[],
  cache: Readonly<Record<string, unknown>>,
): string[] => keys.filter((k) => !(k in cache));

/** `cache` restricted to `keys` (the current context's thumbnails). */
export const retainThumbs = <T>(
  cache: Readonly<Record<string, T>>,
  keys: readonly string[],
): Record<string, T> =>
  Object.fromEntries(keys.flatMap((k) => (k in cache ? [[k, cache[k] as T]] : [])));

/** Linjer value of "Återställ": the last chosen detail preset's, else the default (R52.7). */
export const linesResetValue = (last: DetailPreset['id'] | null): number =>
  DETAIL_PRESETS.find((p) => p.id === last)?.lineSensitivity ?? DEFAULT_SETTINGS.lineSensitivity;

/**
 * Cache key of a preset thumbnail: the form without the preset fields (`lineSensitivity`,
 * `details`) plus `context` (lattice, palette, crop, image), so a thumbnail is reused while
 * nothing else changes.
 */
export function thumbKey(form: ImportForm, context: string): string {
  const { lineSensitivity: _l, details: _d, ...rest } = form;
  return JSON.stringify([rest, context]);
}
