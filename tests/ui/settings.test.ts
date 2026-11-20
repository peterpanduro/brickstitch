import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type KeyValueStore } from '../../src/core';
import {
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  themeAttribute,
} from '../../src/ui/state/settings';

function memory(initial?: object): KeyValueStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  if (initial) m.set(SETTINGS_KEY, JSON.stringify(initial));
  return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

const stored = (s: { m: Map<string, string> }) => JSON.parse(s.m.get(SETTINGS_KEY) ?? '{}');

describe('theme setting (R45)', () => {
  it('defaults to system and round-trips', () => {
    const store = memory();
    expect(loadSettings(store, 'sv').theme).toBe('system');
    saveSettings(store, { ...loadSettings(store, 'sv'), theme: 'dark' });
    expect(stored(store).theme).toBe('dark');
    expect(loadSettings(store, 'sv').theme).toBe('dark');
  });

  it('loads system for v1 and v2 stores and for invalid values', () => {
    expect(loadSettings(memory({ locale: 'en' }), 'sv').theme).toBe('system');
    expect(loadSettings(memory({ settingsVersion: 2, locale: 'en' }), 'sv').theme).toBe('system');
    expect(loadSettings(memory({ settingsVersion: 3, theme: 'sepia' }), 'sv').theme).toBe('system');
  });

  it('saves settingsVersion 4', () => {
    const store = memory();
    saveSettings(store, loadSettings(store, 'sv'));
    expect(SETTINGS_VERSION).toBe(4);
    expect(stored(store).settingsVersion).toBe(4);
  });

  it('resets a stored border key tolerance to auto before v4 and keeps it from v4 (R59.1)', () => {
    const analysis = (borderKeyTolerance: unknown) => ({ ...DEFAULT_SETTINGS, borderKeyTolerance });
    const tol = (v: object) => loadSettings(memory(v), 'sv').analysis.borderKeyTolerance;
    expect(tol({ analysis: analysis(12) })).toBe('auto');
    expect(tol({ settingsVersion: 2, analysis: analysis(29) })).toBe('auto');
    expect(tol({ settingsVersion: 3, analysis: analysis(12) })).toBe('auto');
    expect(tol({ settingsVersion: 4, analysis: analysis(12) })).toBe(12);
    expect(tol({ settingsVersion: 4, analysis: analysis(29) })).toBe(29);
    expect(tol({ settingsVersion: 4, analysis: analysis('auto') })).toBe('auto');
    expect(tol({ settingsVersion: 4, analysis: analysis('x') })).toBe('auto');
  });

  it('migrates fit contain → auto only for unversioned settings, not for v2', () => {
    const analysis = { ...DEFAULT_SETTINGS, fit: 'contain' };
    expect(loadSettings(memory({ analysis }), 'sv').analysis.fit).toBe('auto');
    expect(loadSettings(memory({ settingsVersion: 2, analysis }), 'sv').analysis.fit).toBe(
      'contain',
    );
    expect(loadSettings(memory({ settingsVersion: 3, analysis }), 'sv').analysis.fit).toBe(
      'contain',
    );
  });

  it('maps the theme to the data-theme attribute (removed for system)', () => {
    expect(themeAttribute('system')).toBeNull();
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });
});
