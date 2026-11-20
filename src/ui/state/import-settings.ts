import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type AnalysisTarget,
  type BackgroundMode,
  type FitMode,
  type MessageKey,
  type ResolvedBackground,
  type Rotation,
} from '../../core';

/** Analysis fields edited in the import dialog; `margin` is a select value (`auto`, `0`..`5`). */
export type ImportForm = Pick<
  AnalysisSettings,
  | 'background'
  | 'threshold'
  | 'thresholdInvert'
  | 'borderKeyTolerance'
  | 'fit'
  | 'lineSensitivity'
  | 'details'
  | 'maxColors'
  | 'coverage'
  | 'despeckle'
  | 'fixRings'
  | 'autoPrune'
  | 'rotation'
  | 'flipH'
  | 'autoSize'
> & { readonly margin: string };

const BACKGROUNDS: readonly BackgroundMode[] = ['auto', 'alpha', 'borderKey', 'threshold', 'none'];
const FITS: readonly FitMode[] = ['auto', 'contain', 'width', 'height', 'stretch'];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

const num = (v: unknown, lo: number, hi: number, fallback: number, int = false): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const c = Math.min(hi, Math.max(lo, n));
  return int ? Math.round(c) : c;
};

const oneOf = <T extends string | number>(v: unknown, all: readonly T[], fallback: T): T =>
  all.includes(v as T) ? (v as T) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function tolerance(
  v: unknown,
  fallback: AnalysisSettings['borderKeyTolerance'],
): AnalysisSettings['borderKeyTolerance'] {
  if (v === 'auto') return 'auto';
  const n = num(v, 2, 40, Number.NaN);
  return Number.isNaN(n) ? fallback : n;
}

function margin(v: unknown, fallback: AnalysisSettings['margin']): AnalysisSettings['margin'] {
  if (v === 'auto') return 'auto';
  if (typeof v !== 'number' && typeof v !== 'string') return fallback;
  return num(v, 0, 5, typeof fallback === 'number' ? fallback : 0, true);
}

/**
 * Validated analysis settings from untrusted `raw` (stored JSON or form values): invalid fields
 * are replaced from `base`, out-of-range numbers clamped; `supersample` and `panelBackground`
 * are kept from `base`.
 */
export function sanitizeAnalysis(
  raw: unknown,
  base: AnalysisSettings = DEFAULT_SETTINGS,
): AnalysisSettings {
  const v = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    ...base,
    background: oneOf(v.background, BACKGROUNDS, base.background),
    threshold: num(v.threshold, 0, 255, base.threshold, true),
    thresholdInvert: bool(v.thresholdInvert, base.thresholdInvert),
    borderKeyTolerance: tolerance(v.borderKeyTolerance, base.borderKeyTolerance),
    margin: margin(v.margin, base.margin),
    fit: oneOf(v.fit, FITS, base.fit),
    coverage: num(v.coverage, 0.3, 0.7, base.coverage),
    lineSensitivity: num(v.lineSensitivity, 0, 1, base.lineSensitivity),
    details: num(v.details, 0, 1, base.details),
    maxColors: num(v.maxColors, 2, 8, base.maxColors, true),
    despeckle: bool(v.despeckle, base.despeckle),
    fixRings: bool(v.fixRings, base.fixRings),
    autoPrune: bool(v.autoPrune, base.autoPrune),
    rotation: oneOf(v.rotation, ROTATIONS, base.rotation),
    flipH: bool(v.flipH, base.flipH),
    autoSize:
      v.autoSize === 'width' || v.autoSize === 'height' || v.autoSize === null
        ? v.autoSize
        : base.autoSize,
  };
}

/** Form values of `s`. */
export const settingsToForm = (s: AnalysisSettings): ImportForm => ({
  background: s.background,
  threshold: s.threshold,
  thresholdInvert: s.thresholdInvert,
  borderKeyTolerance: s.borderKeyTolerance,
  margin: String(s.margin),
  fit: s.fit,
  lineSensitivity: s.lineSensitivity,
  details: s.details,
  maxColors: s.maxColors,
  coverage: s.coverage,
  despeckle: s.despeckle,
  fixRings: s.fixRings,
  autoPrune: s.autoPrune,
  rotation: s.rotation,
  flipH: s.flipH,
  autoSize: s.autoSize,
});

/** Analysis settings from form values (clamped), other fields from `base`. */
export const formToSettings = (
  f: ImportForm,
  base: AnalysisSettings = DEFAULT_SETTINGS,
): AnalysisSettings => sanitizeAnalysis(f, base);

/** Whether `t` is a size the pattern format accepts (width 2..80, height 1..120, integers). */
export const validTarget = (t: AnalysisTarget): boolean =>
  Number.isInteger(t.width) &&
  t.width >= 2 &&
  t.width <= 80 &&
  Number.isInteger(t.height) &&
  t.height >= 1 &&
  t.height <= 120;

/**
 * Background card of wizard step 2 (SPEC R53): Hitta åt mig (`auto`), Ta bort det ljusa
 * (`threshold`, not inverted), Behåll hela bilden (`none`), or the read-only "Eget val" for modes
 * only the "Fler inställningar" select sets (`alpha`, `borderKey`, inverted threshold).
 */
export type BackgroundChoice = 'auto' | 'light' | 'whole' | 'custom';

/** The card matching the form's background mode. */
export function backgroundChoice(
  f: Pick<ImportForm, 'background' | 'thresholdInvert'>,
): BackgroundChoice {
  if (f.background === 'auto') return 'auto';
  if (f.background === 'none') return 'whole';
  if (f.background === 'threshold' && !f.thresholdInvert) return 'light';
  return 'custom';
}

/** Form patch selecting a card. */
export const backgroundPatch = (c: Exclude<BackgroundChoice, 'custom'>): Partial<ImportForm> =>
  c === 'auto'
    ? { background: 'auto' }
    : c === 'whole'
      ? { background: 'none' }
      : { background: 'threshold', thresholdInvert: false };

/**
 * "Hur mycket ska tas bort?" (SPEC R53): the edited field, its range, the slider position
 * `value` (Mer = right), visibility and the status line from the resolved mode.
 */
export interface RemovalSlider {
  readonly visible: boolean;
  readonly field: 'borderKeyTolerance' | 'threshold';
  readonly min: number;
  readonly max: number;
  /** Slider position; equals the field value unless {@link RemovalSlider.reversed}. */
  readonly value: number;
  /** Mer = a lower field value (threshold, not inverted: `thresholdMask` keeps darker pixels). */
  readonly reversed: boolean;
  /** The tolerance is automatic (R59.1): the slider rests at 12 and moving it makes it manual. */
  readonly auto: boolean;
  readonly status: MessageKey | null;
}

/** Slider position shown while the tolerance is automatic. */
const REST_TOLERANCE = 12;

/**
 * Removal slider for the form and the mode the last analysis resolved to (`null` before a
 * result): tolerance 2–40 for auto/borderKey, reversed threshold 0–255 for threshold; hidden for
 * `none`, `alpha` and auto resolved to alpha.
 */
export function removalSlider(f: ImportForm, resolved: ResolvedBackground | null): RemovalSlider {
  if (f.background === 'threshold') {
    const reversed = !f.thresholdInvert;
    return {
      visible: true,
      field: 'threshold',
      min: 0,
      max: 255,
      value: reversed ? 255 - f.threshold : f.threshold,
      reversed,
      auto: false,
      status: null,
    };
  }
  const auto = f.background === 'auto';
  const status: MessageKey | null =
    auto && resolved === 'alpha'
      ? 'wizard.bg.status.alpha'
      : auto && resolved === 'none'
        ? 'wizard.bg.status.none'
        : null;
  return {
    visible: auto ? resolved !== 'alpha' : f.background === 'borderKey',
    field: 'borderKeyTolerance',
    min: 2,
    max: 40,
    value: f.borderKeyTolerance === 'auto' ? REST_TOLERANCE : f.borderKeyTolerance,
    reversed: false,
    auto: f.borderKeyTolerance === 'auto',
    status,
  };
}

/** Form patch for slider position `pos`. */
export const removalPatch = (s: RemovalSlider, pos: number): Partial<ImportForm> => ({
  [s.field]: s.reversed ? s.min + s.max - pos : pos,
});

/** Form patch handing the tolerance back to the automatic choice (R59.1). */
export const removalAutoPatch: Partial<ImportForm> = { borderKeyTolerance: 'auto' };
