import { describe, expect, it } from 'vitest';
import { en, formatMm, formatNote, formatWarning, sv, t } from '../src/core/i18n';
import type { RowNote, Warning } from '../src/core';

describe('message catalogues', () => {
  it('have identical keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(sv).sort());
  });

  it('have no empty strings and matching placeholders', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(sv) as (keyof typeof sv)[]) {
      expect(sv[k].length, k).toBeGreaterThan(0);
      expect(en[k].length, k).toBeGreaterThan(0);
      expect(ph(en[k]), k).toEqual(ph(sv[k]));
    }
  });
});

describe('t', () => {
  it('interpolates params', () => {
    expect(t('sv', 'pdf.meta.rows', { n: 27 })).toBe('27 rader');
    expect(t('en', 'pdf.meta.rows', { n: 27 })).toBe('27 rows');
  });

  it('selects _one/_other plural forms by n', () => {
    expect(t('sv', 'note.parts', { n: 1 })).toBe('1 del');
    expect(t('sv', 'note.parts', { n: 3 })).toBe('3 delar – sy varje del för sig');
    expect(t('en', 'note.extraLadder', { n: 1, side: 'left' })).toBe('extra ladder left: 1 bead');
    expect(t('en', 'note.extraLadder', { n: 0, side: 'left' })).toBe('extra ladder left: 0 beads');
  });

  it('leaves unknown placeholders intact', () => {
    expect(t('en', 'pdf.meta.rows')).toBe('{n} rows');
  });

  it('translates labels', () => {
    expect(t('sv', 'ui.undo')).toBe('Ångra');
    expect(t('en', 'ui.undo')).toBe('Undo');
  });
});

describe('formatNote', () => {
  const cases: [RowNote, string, string][] = [
    [{ kind: 'ladderStart' }, 'stegsöm – börja här', 'ladder – start here'],
    [{ kind: 'increase', side: 'left', count: 1 }, 'öka 1 vänster', 'increase 1 left'],
    [{ kind: 'increase', side: 'right', count: 2 }, 'öka 2 höger', 'increase 2 right'],
    [
      { kind: 'stepIn', side: 'right', count: 1 },
      'hoppa in 1 extra höger',
      'step in 1 extra right',
    ],
    [
      { kind: 'stepIn', side: 'left', count: 3 },
      'hoppa in 3 extra vänster',
      'step in 3 extra left',
    ],
    [
      { kind: 'extraLadder', side: 'left', count: 2 },
      'extra stegsöm vänster: 2 pärlor',
      'extra ladder left: 2 beads',
    ],
    [
      { kind: 'extraLadder', side: 'right', count: 1 },
      'extra stegsöm höger: 1 pärla',
      'extra ladder right: 1 bead',
    ],
    [{ kind: 'parts', count: 1 }, '1 del', '1 part'],
    [
      { kind: 'parts', count: 2 },
      '2 delar – sy varje del för sig',
      '2 parts – sew each separately',
    ],
  ];
  it.each(cases)('%j', (note, sv, en) => {
    expect(formatNote('sv', note)).toBe(sv);
    expect(formatNote('en', note)).toBe(en);
  });

  it('has the gap marker', () => {
    expect(t('sv', 'note.gap')).toBe('· lucka ·');
    expect(t('en', 'note.gap')).toBe('· gap ·');
  });
});

describe('formatWarning', () => {
  const ws: Warning[] = [
    { code: 'floating', r: 3, h: 4 },
    { code: 'needsExtraLadder', r: 3, h: 4 },
    { code: 'segments', r: 5, value: 3 },
    { code: 'thinLine', r: 2, h: 7, value: 4 },
    { code: 'panelGaps', r: 0, h: 1 },
  ];
  it.each(ws)('$code in both locales', (w) => {
    for (const l of ['sv', 'en'] as const) {
      const s = formatWarning(l, w);
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toMatch(/\{\w+\}/);
    }
  });

  it('interpolates counts', () => {
    expect(formatWarning('en', { code: 'segments', r: 5, value: 3 })).toContain('3');
    expect(formatWarning('sv', { code: 'thinLine', r: 2, h: 7, value: 4 })).toContain('4');
  });
});

describe('formatMm', () => {
  it('uses one decimal and the locale decimal separator', () => {
    expect(formatMm('sv', 14.4)).toBe('14,4');
    expect(formatMm('en', 14.4)).toBe('14.4');
    expect(formatMm('en', 3)).toBe('3.0');
  });
});
