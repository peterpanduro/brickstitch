import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type KeyValueStore,
  type Locale,
} from '../../core';
import { sanitizeAnalysis } from './import-settings';

/** localStorage key of UI settings (SPEC §9). */
export const SETTINGS_KEY = 'bs:v1:settings';

/**
 * Stored settings format: 1 unversioned (gets `fit: contain` → `auto` once), 2 adds the
 * version, 3 adds `theme` (SPEC R45), 4 makes `analysis.borderKeyTolerance` `auto`-capable (R59.1;
 * numbers stored before it are dropped).
 */
export const SETTINGS_VERSION = 4;

/** Colour theme choice (SPEC R45); `system` follows `prefers-color-scheme`. */
export type Theme = 'system' | 'light' | 'dark';

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/** `data-theme` value on `<html>` for `theme`; `null` removes the attribute (`system`). */
export const themeAttribute = (theme: Theme): 'light' | 'dark' | null =>
  theme === 'system' ? null : theme;

/** Canvas zoom: fit to the viewport or pixels per millimetre. */
export type Zoom = 'fit' | number;

/** Persisted UI settings. */
export interface Settings {
  readonly locale: Locale;
  readonly zoom: Zoom;
  readonly realSize: boolean;
  /** Last applied image-import settings (defaults when none were applied). */
  readonly analysis: AnalysisSettings;
  /** Whether `analysis` was applied by the user; only then is it persisted. */
  readonly analysisApplied: boolean;
  readonly theme: Theme;
}

const LOCALES: readonly Locale[] = ['sv', 'en'];

const zoomOf = (v: unknown): Zoom =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 'fit';

/**
 * Reads settings; missing or invalid values use defaults (`fallback` locale, fit, not real size,
 * default analysis, `system` theme). Unversioned settings migrate a stored `fit: contain` to
 * `auto`; settings older than version 4 reset `borderKeyTolerance` to `auto`.
 */
export function loadSettings(store: KeyValueStore, fallback: Locale): Settings {
  let v: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(store.get(SETTINGS_KEY) ?? '{}');
    if (typeof raw === 'object' && raw !== null) v = raw as Record<string, unknown>;
  } catch {
    v = {};
  }
  const stored = typeof v.analysis === 'object' && v.analysis !== null;
  const raw = stored ? (v.analysis as Record<string, unknown>) : undefined;
  const version = typeof v.settingsVersion === 'number' ? v.settingsVersion : 1;
  let migrated = raw;
  if (migrated && v.settingsVersion === undefined && migrated.fit === 'contain')
    migrated = { ...migrated, fit: 'auto' };
  if (migrated && version < 4) migrated = { ...migrated, borderKeyTolerance: 'auto' };
  return {
    locale: LOCALES.includes(v.locale as Locale) ? (v.locale as Locale) : fallback,
    zoom: zoomOf(v.zoom),
    realSize: v.realSize === true,
    analysis: sanitizeAnalysis(migrated, DEFAULT_SETTINGS),
    analysisApplied: stored,
    theme: THEMES.includes(v.theme as Theme) ? (v.theme as Theme) : 'system',
  };
}

/** Writes settings (analysis only when applied); returns `false` when storage refused. */
export function saveSettings(store: KeyValueStore, s: Settings): boolean {
  const { analysis, analysisApplied, ...ui } = s;
  try {
    store.set(
      SETTINGS_KEY,
      JSON.stringify({
        settingsVersion: SETTINGS_VERSION,
        ...ui,
        ...(analysisApplied ? { analysis } : {}),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
