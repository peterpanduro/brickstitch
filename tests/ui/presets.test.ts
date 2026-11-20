import { describe, expect, it } from 'vitest';
import { t } from '../../src/core';
import { defaultSize } from '../../src/ui/state/new-pattern';
import {
  DETAIL_PRESETS,
  matchingPreset,
  SIZE_PRESET_IDS,
  sizePresets,
} from '../../src/ui/state/presets';

describe('size presets (R52.8)', () => {
  it('panel 9×18 / 11×22 / 15×30', () => {
    expect(sizePresets('panel').map((p) => [p.id, p.width, p.height])).toEqual([
      ['small', 9, 18],
      ['medium', 11, 22],
      ['large', 15, 30],
    ]);
  });

  it('shaped 15×22 / 20×28 / 26×36', () => {
    expect(sizePresets('shaped').map((p) => [p.width, p.height])).toEqual([
      [15, 22],
      [20, 28],
      [26, 36],
    ]);
  });

  it('Mellan is the default size', () => {
    for (const mode of ['panel', 'shaped'] as const) {
      const medium = sizePresets(mode).find((p) => p.id === 'medium');
      expect(medium && { width: medium.width, height: medium.height }).toEqual(defaultSize(mode));
    }
  });

  it('has labels in both languages, including Egen', () => {
    expect(SIZE_PRESET_IDS).toEqual(['small', 'medium', 'large']);
    expect(sizePresets('panel').map((p) => t('sv', p.labelKey))).toEqual([
      'Liten',
      'Mellan',
      'Stor',
    ]);
    expect(t('sv', 'size.preset.custom')).toBe('Egen');
    expect(t('en', 'size.preset.custom')).toBe('Custom');
  });
});

describe('detail presets (R52.7)', () => {
  it('Enkel, Lagom, Detaljerad', () => {
    expect(DETAIL_PRESETS).toEqual([
      { id: 'simple', lineSensitivity: 0.3, details: 0 },
      { id: 'balanced', lineSensitivity: 0.5, details: 0.25 },
      { id: 'detailed', lineSensitivity: 0.8, details: 0.75 },
    ]);
  });
});

describe('matchingPreset', () => {
  it('finds the preset whose values equal the form', () => {
    expect(matchingPreset(DETAIL_PRESETS, { lineSensitivity: 0.5, details: 0.25, x: 1 })).toBe(
      'balanced',
    );
    expect(matchingPreset(DETAIL_PRESETS, { lineSensitivity: 0.1 + 0.2, details: 0 })).toBe(
      'simple',
    );
    expect(matchingPreset(sizePresets('panel'), { width: 15, height: 30 })).toBe('large');
  });

  it('returns null after a manual change', () => {
    expect(matchingPreset(DETAIL_PRESETS, { lineSensitivity: 0.55, details: 0.25 })).toBeNull();
    expect(matchingPreset(sizePresets('panel'), { width: 15, height: 31 })).toBeNull();
  });
});
