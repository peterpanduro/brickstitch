import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type KeyValueStore } from '../../src/core';
import { createPattern, parsePatternFile, serialise } from '../../src/core';
import {
  activePreset,
  beadEstimate,
  buildNewPattern,
  cancelPending,
  choiceSizeMm,
  confirmPending,
  defaultSize,
  importTarget,
  requestAction,
  withMode,
  withPreset,
  withSize,
  initialStartState,
  isStarter,
  sizeReadout,
  starterPattern,
} from '../../src/ui/state/new-pattern';
import { loadSettings, saveSettings } from '../../src/ui/state/settings';

describe('new pattern', () => {
  it('defaults: panel 11×22, shaped 20×28 (SPEC §10)', () => {
    expect(defaultSize('panel')).toEqual({ width: 11, height: 22 });
    expect(defaultSize('shaped')).toEqual({ width: 20, height: 28 });
  });

  it('size readout for both bead types', () => {
    const r = sizeReadout(11, 22);
    expect(r.delica11.width).toBeCloseTo(17.6);
    expect(r.delica11.height).toBeCloseTo(28.6);
    expect(r.delica15.width).toBeCloseTo(14.3);
    expect(r.delica15.height).toBeCloseTo(25.3);
  });

  it('panel: filled with the background, palette background + contrast colour', () => {
    const p = buildNewPattern({
      beadType: 'delica11',
      mode: 'panel',
      width: 11,
      height: 22,
      background: 'DB-200',
    });
    expect(p.palette.map((e) => e.db)).toEqual(['DB-200', 'DB-010']);
    expect(p.cells.flat().every((c) => c === p.palette[0]?.id)).toBe(true);
    const dark = buildNewPattern({
      beadType: 'delica11',
      mode: 'panel',
      width: 4,
      height: 2,
      background: 'DB-010',
    });
    expect(dark.palette.map((e) => e.db)).toEqual(['DB-010', 'DB-200']);
  });

  it('shaped: empty cells', () => {
    const p = buildNewPattern({
      beadType: 'delica15',
      mode: 'shaped',
      width: 5,
      height: 3,
      background: 'DB-200',
    });
    expect(p.cells.flat().every((c) => c === null)).toBe(true);
    expect(p.beadType).toBe('delica15');
  });
});

describe('settings', () => {
  it('round-trips locale and zoom and falls back on bad data', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = {
      get: (k) => data.get(k) ?? null,
      set: (k, v) => void data.set(k, v),
    };
    const def = {
      zoom: 'fit',
      realSize: false,
      analysis: DEFAULT_SETTINGS,
      analysisApplied: false,
      theme: 'system',
    };
    expect(loadSettings(s, 'en')).toEqual({ locale: 'en', ...def });
    saveSettings(s, {
      locale: 'sv',
      zoom: 12.5,
      realSize: true,
      analysis: DEFAULT_SETTINGS,
      analysisApplied: true,
      theme: 'dark',
    });
    expect(loadSettings(s, 'en')).toEqual({
      locale: 'sv',
      zoom: 12.5,
      realSize: true,
      analysis: DEFAULT_SETTINGS,
      analysisApplied: true,
      theme: 'dark',
    });
    data.set('bs:v1:settings', '{"locale":"de","zoom":-3,"realSize":"x"}');
    expect(loadSettings(s, 'en')).toEqual({ locale: 'en', ...def });
    data.set('bs:v1:settings', '{');
    expect(loadSettings(s, 'sv')).toEqual({ locale: 'sv', ...def });
  });
});

describe('starter pattern', () => {
  it('recognises the starter, also after an autosave round trip', () => {
    const s = starterPattern();
    expect(isStarter(s)).toBe(true);
    const r = parsePatternFile(serialise(s, '0.1.0', new Date(5)));
    expect(r.ok && isStarter(r.pattern)).toBe(true);
  });

  it('does not treat edited or other patterns as the starter', () => {
    const s = starterPattern();
    expect(isStarter({ ...s, title: 'x' })).toBe(false);
    const cells = s.cells.map((row, r) => row.map((c, i) => (r === 0 && i === 0 ? 'c2' : c)));
    expect(isStarter({ ...s, cells })).toBe(false);
    const other = createPattern({
      beadType: 'delica11',
      mode: 'shaped',
      width: 11,
      height: 22,
      palette: s.palette,
    });
    expect(isStarter(other)).toBe(false);
  });
});

describe('start state (R55)', () => {
  it('starts with drawing a medium white panel', () => {
    expect(initialStartState()).toEqual({
      method: 'draw',
      choice: { beadType: 'delica11', mode: 'panel', width: 11, height: 22, background: 'DB-200' },
    });
  });

  it('returns a fresh object each time', () => {
    expect(initialStartState()).not.toBe(initialStartState());
  });
});

describe('start page choices (R55)', () => {
  const base = initialStartState().choice;

  it('slider readout: 11 beads of delica11 = 17,6 mm, 22 rows = 28,6 mm; 15/0 is smaller', () => {
    const r = choiceSizeMm({ ...base, width: 11, height: 22 });
    expect(r.width).toBeCloseTo(17.6);
    expect(r.height).toBeCloseTo(28.6);
    expect(choiceSizeMm({ ...base, beadType: 'delica15' }).width).toBeCloseTo(14.3);
  });

  it('bead estimate: exact for panels (alternating W, W-1), "up to" for shaped', () => {
    expect(beadEstimate({ ...base, mode: 'panel', width: 11, height: 22 })).toEqual({
      count: 11 * 11 + 10 * 11,
      exact: true,
    });
    expect(beadEstimate({ ...base, mode: 'shaped', width: 20, height: 3 })).toEqual({
      count: 20 + 19 + 20,
      exact: false,
    });
  });

  it('mode switch keeps the preset tier; a custom size stays', () => {
    expect(withMode(base, 'shaped')).toMatchObject({ mode: 'shaped', width: 20, height: 28 });
    const large = withPreset(base, 'large');
    expect(withMode(large, 'shaped')).toMatchObject({ mode: 'shaped', width: 26, height: 36 });
    const small = withPreset({ ...base, mode: 'shaped', width: 20, height: 28 }, 'small');
    expect(withMode(small, 'panel')).toMatchObject({ mode: 'panel', width: 9, height: 18 });
    const custom = { ...base, width: 12, height: 40 };
    expect(withMode(custom, 'shaped')).toMatchObject({ mode: 'shaped', width: 12, height: 40 });
  });

  it('presets and sizes clamp', () => {
    expect(withPreset(base, 'large')).toMatchObject({ width: 15, height: 30 });
    expect(withSize(base, { width: 500, height: 0 })).toMatchObject({ width: 80, height: 1 });
    expect(withSize(base, { width: 1.4 })).toMatchObject({ width: 2 });
    expect(activePreset(base)).toBe('medium');
    expect(activePreset(withSize(base, { width: 12 }))).toBeNull();
  });

  it('the import target carries the page choices', () => {
    const s = initialStartState();
    expect(importTarget(s)).toEqual({ source: 'start', choice: s.choice });
  });
});

describe('start flow (confirm before any action that replaces the pattern)', () => {
  const idle = { pending: null };

  it('clean pattern: actions run immediately', () => {
    expect(requestAction(idle, { kind: 'create' }, false)).toEqual({
      flow: idle,
      run: { kind: 'create' },
    });
  });

  it('dirty: create waits for confirmation, then runs', () => {
    const r = requestAction(idle, { kind: 'create' }, true);
    expect(r.run).toBeNull();
    expect(r.flow.pending).toEqual({ kind: 'create' });
    expect(confirmPending(r.flow)).toEqual({ flow: idle, run: { kind: 'create' } });
  });

  it('dirty: the file picker opens only after confirmation', () => {
    const r = requestAction(idle, { kind: 'pick', pick: 'image' }, true);
    expect(r.run).toBeNull();
    expect(confirmPending(r.flow).run).toEqual({ kind: 'pick', pick: 'image' });
  });

  it('dirty: a drop follows the same order', () => {
    const file = { name: 'a.png' };
    const r = requestAction(idle, { kind: 'drop', file }, true);
    expect(r.run).toBeNull();
    expect(confirmPending(r.flow).run).toEqual({ kind: 'drop', file });
  });

  it('cancel clears the pending action; confirm without one is a no-op', () => {
    const r = requestAction(idle, { kind: 'create' }, true);
    expect(cancelPending(r.flow)).toEqual(idle);
    expect(confirmPending(idle)).toEqual({ flow: idle, run: null });
  });
});
