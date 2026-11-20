import { describe, expect, it } from 'vitest';
import {
  analyseImage,
  BEAD_TYPES,
  beadRect,
  createPattern,
  DEFAULT_SETTINGS,
  paletteEntryFromSeed,
  SEED_CATALOG,
  type KeyValueStore,
  type PaletteEntry,
  type MessageKey,
  type Params,
  type PluralKey,
  type RgbaImage,
  t,
} from '../../src/core';
import { createEditor, current, undoEdit } from '../../src/ui/state/editor';
import { dropAllowed, fileKind, scaledSize } from '../../src/ui/state/file';
import {
  candidatePalette,
  defaultIncludeExtra,
  importStats,
  mergeImport,
  importStatsText,
  ringOutline,
} from '../../src/ui/state/import-merge';
import { samiFlag } from '../flag';
import {
  formToSettings,
  sanitizeAnalysis,
  settingsToForm,
  validTarget,
} from '../../src/ui/state/import-settings';
import { applyImport, isDirty } from '../../src/ui/state/session';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../../src/ui/state/settings';

const W: PaletteEntry = { id: 'c1', db: 'DB-200', hex: '#f7f7f5' };
const K: PaletteEntry = { id: 'c2', db: 'DB-010', hex: '#1c1c1c' };
const base = createPattern({
  beadType: 'delica11',
  mode: 'shaped',
  width: 6,
  height: 8,
  palette: [W, K],
});
const catalogue = SEED_CATALOG.map((e) => paletteEntryFromSeed(e, e.db));
const memory = (init: Record<string, string> = {}): KeyValueStore & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init));
  return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

function redDisc(): RgbaImage {
  const n = 60;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if ((x - 30) ** 2 + (y - 30) ** 2 < 400) {
        const i = (y * n + x) * 4;
        data[i] = 215;
        data[i + 1] = 38;
        data[i + 2] = 43;
      }
  return { width: n, height: n, data };
}

describe('settings <-> form', () => {
  it('round-trips the defaults', () => {
    expect(formToSettings(settingsToForm(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('maps margin between select value and setting', () => {
    expect(settingsToForm({ ...DEFAULT_SETTINGS, margin: 2 }).margin).toBe('2');
    expect(formToSettings({ ...settingsToForm(DEFAULT_SETTINGS), margin: '3' }).margin).toBe(3);
    expect(formToSettings({ ...settingsToForm(DEFAULT_SETTINGS), margin: 'auto' }).margin).toBe(
      'auto',
    );
  });

  it('clamps out-of-range values and keeps non-form fields from base', () => {
    const s = formToSettings(
      { ...settingsToForm(DEFAULT_SETTINGS), maxColors: 99, coverage: 0.1, lineSensitivity: 3 },
      { ...DEFAULT_SETTINGS, supersample: 8 },
    );
    expect([s.maxColors, s.coverage, s.lineSensitivity, s.supersample]).toEqual([8, 0.3, 1, 8]);
  });

  it('round-trips details, clamps it and loads old settings without it as 0', () => {
    const f = { ...settingsToForm(DEFAULT_SETTINGS), details: 0.4 };
    expect(settingsToForm(formToSettings(f)).details).toBe(0.4);
    expect(formToSettings({ ...f, details: 7 }).details).toBe(1);
    const { details: _, ...old } = { ...DEFAULT_SETTINGS, lineSensitivity: 0.7 };
    expect(sanitizeAnalysis(old).details).toBe(0);
    expect(DEFAULT_SETTINGS.details).toBe(0);
  });

  it('validates the target size', () => {
    const target = { beadType: 'delica11', mode: 'shaped', width: 6, height: 8 } as const;
    expect(validTarget({ ...target, width: 1 })).toBe(false);
    expect(validTarget({ ...target, height: 121 })).toBe(false);
    expect(validTarget({ ...target, width: 2.5 })).toBe(false);
    expect(validTarget(target)).toBe(true);
  });
});

describe('persistence', () => {
  it('defaults when nothing or garbage is stored', () => {
    expect(loadSettings(memory(), 'en').analysis).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeAnalysis('x')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeAnalysis({ background: 'bogus', maxColors: 'many', fit: 7 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('stores the analysis next to the UI settings and reads it back', () => {
    const store = memory();
    const s = loadSettings(store, 'sv');
    const analysis = { ...DEFAULT_SETTINGS, lineSensitivity: 0.8, maxColors: 6 };
    expect(saveSettings(store, { ...s, locale: 'en', analysis, analysisApplied: true })).toBe(true);
    expect(JSON.parse(store.m.get(SETTINGS_KEY) ?? '{}').analysis.lineSensitivity).toBe(0.8);
    const r = loadSettings(store, 'sv');
    expect(r.locale).toBe('en');
    expect(r.analysis).toEqual(analysis);
  });

  it('migrates fit contain to auto once for unversioned settings', () => {
    const old = { locale: 'en', analysis: { ...DEFAULT_SETTINGS, fit: 'contain', maxColors: 6 } };
    const store = memory({ [SETTINGS_KEY]: JSON.stringify(old) });
    const r = loadSettings(store, 'sv');
    expect([r.analysis.fit, r.analysis.maxColors, r.analysisApplied]).toEqual(['auto', 6, true]);
    saveSettings(store, { ...r, analysis: { ...r.analysis, fit: 'contain' } });
    expect(JSON.parse(store.m.get(SETTINGS_KEY) ?? '{}').settingsVersion).toBe(3);
    expect(loadSettings(store, 'sv').analysis.fit).toBe('contain');
  });

  it('does not persist analysis settings that were never applied', () => {
    const store = memory();
    saveSettings(store, { ...loadSettings(store, 'sv'), locale: 'en' });
    const stored = JSON.parse(store.m.get(SETTINGS_KEY) ?? '{}');
    expect(stored.locale).toBe('en');
    expect(stored).not.toHaveProperty('analysis');
    const applied = { ...DEFAULT_SETTINGS, maxColors: 5 };
    saveSettings(store, { ...loadSettings(store, 'sv'), analysis: applied, analysisApplied: true });
    saveSettings(store, { ...loadSettings(store, 'sv'), zoom: 3 });
    expect(loadSettings(store, 'sv').analysis).toEqual(applied);
  });

  it('keeps old stored settings without analysis valid', () => {
    const store = memory({ [SETTINGS_KEY]: '{"locale":"en","zoom":2,"realSize":true}' });
    const r = loadSettings(store, 'sv');
    expect([r.locale, r.zoom, r.realSize]).toEqual(['en', 2, true]);
    expect(r.analysis).toEqual(DEFAULT_SETTINGS);
  });
});

describe('orientation settings', () => {
  it('reads rotation and mirror back, rejects invalid values, defaults when missing', () => {
    expect(DEFAULT_SETTINGS.rotation).toBe(0);
    expect(DEFAULT_SETTINGS.flipH).toBe(false);
    expect(sanitizeAnalysis({ rotation: 270, flipH: true })).toMatchObject({
      rotation: 270,
      flipH: true,
    });
    expect(sanitizeAnalysis({ rotation: 45, flipH: 'yes' })).toMatchObject({
      rotation: 0,
      flipH: false,
    });
    const old = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete old.rotation;
    delete old.flipH;
    expect(sanitizeAnalysis(old)).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts auto and stretch fit and keeps a stored contain', () => {
    expect(sanitizeAnalysis({ fit: 'stretch' }).fit).toBe('stretch');
    expect(sanitizeAnalysis({ fit: 'contain' }).fit).toBe('contain');
    expect(sanitizeAnalysis({}).fit).toBe('auto');
  });

  it('round-trips through the form', () => {
    const s = { ...DEFAULT_SETTINGS, rotation: 90 as const, flipH: true };
    expect(formToSettings(settingsToForm(s))).toEqual(s);
  });
});

describe('candidate palette', () => {
  const lib: PaletteEntry[] = [
    { id: 'm1', db: 'DB-200', hex: '#f7f7f5' },
    { id: 'm2', hex: '#123456' },
  ];

  it('is the pattern palette alone by default, with detail overrides', () => {
    const c = candidatePalette(base, { includeExtra: false, library: lib, detail: { c2: true } });
    expect(c.map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(c[1]?.detail).toBe(true);
    expect(c[0]?.detail).toBeUndefined();
  });

  it('removes a detail flag when overridden off', () => {
    const p = { ...base, palette: [W, { ...K, detail: true }] };
    const c = candidatePalette(p, { includeExtra: false, library: [], detail: { c2: false } });
    expect(c[1]).not.toHaveProperty('detail');
  });

  it('adds library then seed colours not already present, with unique ids', () => {
    const c = candidatePalette(base, { includeExtra: true, library: lib, detail: {} });
    expect(c.slice(0, 2).map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(c[2]?.id).toBe('lib:m2');
    expect(c.filter((e) => e.db === 'DB-200')).toHaveLength(1);
    expect(c.filter((e) => e.db === 'DB-010')).toHaveLength(1);
    expect(c.length).toBe(2 + 1 + SEED_CATALOG.length - 2);
    expect(new Set(c.map((e) => e.id)).size).toBe(c.length);
  });
});

describe('defaultIncludeExtra', () => {
  it('is on for a base palette of two colours or fewer', () => {
    expect(defaultIncludeExtra({ ...base, palette: [W] })).toBe(true);
    expect(defaultIncludeExtra(base)).toBe(true);
  });

  it('is off for three colours or more', () => {
    const c3 = { id: 'c3', hex: '#ff0000' };
    expect(defaultIncludeExtra({ ...base, palette: [W, K, c3] })).toBe(false);
  });
});

describe('apply import', () => {
  const red = SEED_CATALOG.find((s) => s.db === 'DB-723');
  const target = { beadType: 'delica11' as const, mode: 'shaped' as const, width: 10, height: 12 };
  const palette = (): PaletteEntry[] => [
    W,
    K,
    ...(red ? [paletteEntryFromSeed(red, 'seed:DB-723')] : []),
  ];
  const analysis = () => analyseImage(redDisc(), target, palette(), DEFAULT_SETTINGS);

  it('assigns fresh ids to new colours and remaps cells', () => {
    const m = mergeImport(base, analysis(), target);
    expect(m.palette.map((e) => e.id)).toEqual(['c1', 'c2', 'c3']);
    expect(m.palette[2]?.db).toBe('DB-723');
    const used = new Set(m.cells.flat().filter((c) => c !== null));
    expect(used.has('c3')).toBe(true);
    expect([...used].every((c) => m.palette.some((e) => e.id === c))).toBe(true);
  });

  it('adopts the target size and resets a manual ladder', () => {
    const p = { ...base, ladder: { kind: 'manual' as const, row: 3 }, title: 'T' };
    const m = mergeImport(p, analysis(), target);
    expect([m.width, m.height, m.cells.length, m.ladder.kind, m.title]).toEqual([
      10,
      12,
      12,
      'auto',
      'T',
    ]);
  });

  it('is one undo step, marks dirty and undo restores everything', () => {
    const s1 = applyImport(createEditor(base), analysis(), target);
    expect(current(s1)).not.toBe(base);
    expect(isDirty(base, current(s1))).toBe(true);
    const s2 = undoEdit(s1);
    expect(current(s2)).toBe(base);
    expect(s2.history.past).toHaveLength(0);
  });
});

describe('import stats', () => {
  it('counts colours, beads and pruned beads', () => {
    const target = {
      beadType: 'delica11' as const,
      mode: 'shaped' as const,
      width: 10,
      height: 12,
    };
    const a = analyseImage(redDisc(), target, [W, K, { id: 'r', hex: '#d7262b' }]);
    const s = importStats(a, 12.4);
    expect(s.colors).toBe(a.usedPalette.length);
    expect(s.beads).toBe(a.pattern.cells.flat().filter((c) => c !== null).length);
    expect(s.beads).toBeGreaterThan(0);
    expect([s.pruned, s.ms]).toEqual([a.stats.prunedBeads, 12]);
    expect(s.background).toBe(a.stats.background);
  });
});

describe('file helpers', () => {
  it('classifies images by type or extension', () => {
    expect(fileKind({ name: 'a.bin', type: 'image/png' })).toBe('image');
    expect(fileKind({ name: 'a.JPG', type: '' })).toBe('image');
    expect(fileKind({ name: 'x.brickstitch.json', type: 'application/json' })).toBe('pattern');
    expect(fileKind({ name: 'x.json', type: '' })).toBe('pattern');
  });

  it('ignores drops while a dialog is open', () => {
    expect(dropAllowed('editor')).toBe(true);
    expect(dropAllowed('new')).toBe(true);
    expect(dropAllowed('import')).toBe(false);
    expect(dropAllowed('print')).toBe(false);
  });

  it('scales down to the long-side limit, never up', () => {
    expect(scaledSize(4096, 1024, 2048)).toEqual({ width: 2048, height: 512 });
    expect(scaledSize(100, 50, 2048)).toEqual({ width: 100, height: 50 });
    expect(scaledSize(3000, 1, 2048).height).toBe(1);
  });
});

describe('autoSize setting (R34)', () => {
  it('defaults to null, loads old settings as null, round-trips and rejects junk', () => {
    expect(DEFAULT_SETTINGS.autoSize).toBeNull();
    expect(sanitizeAnalysis({}).autoSize).toBeNull();
    expect(sanitizeAnalysis({ autoSize: 'height' }).autoSize).toBe('height');
    expect(sanitizeAnalysis({ autoSize: 'both' }).autoSize).toBeNull();
    const f = settingsToForm({ ...DEFAULT_SETTINGS, autoSize: 'width' });
    expect(formToSettings(f).autoSize).toBe('width');
  });
});

describe('fixRings setting (R37)', () => {
  it('defaults to on, loads old settings on, round-trips and rejects junk', () => {
    expect(sanitizeAnalysis({}).fixRings).toBe(true);
    expect(sanitizeAnalysis({ fixRings: false }).fixRings).toBe(false);
    expect(sanitizeAnalysis({ fixRings: 'no' }).fixRings).toBe(true);
    const f = settingsToForm({ ...DEFAULT_SETTINGS, fixRings: false });
    expect(f.fixRings).toBe(false);
    expect(formToSettings(f).fixRings).toBe(false);
  });
});

describe('fixed rings in the import preview (R37)', () => {
  const t = { beadType: 'delica11' as const, mode: 'panel' as const, width: 11, height: 22 };
  const flag = analyseImage(samiFlag(), t, catalogue, { ...DEFAULT_SETTINGS, rotation: 90 });

  it('counts fixed rings in the stats', () => {
    expect(importStats(flag, 1).ringsFixed).toBe(1);
    const off = analyseImage(samiFlag(), t, catalogue, {
      ...DEFAULT_SETTINGS,
      rotation: 90,
      fixRings: false,
    });
    expect(importStats(off, 1).ringsFixed).toBe(0);
  });

  it('outlines the replaced cells at the scene origin', () => {
    const origin = { x: 5, y: 2 };
    const rects = ringOutline(flag, origin);
    const cells = flag.stats.rings[0]!.cells;
    expect(rects).toHaveLength(cells.length);
    const c = cells[0]!;
    expect(rects[0]).toEqual(beadRect({ t: BEAD_TYPES.delica11, origin }, c.r, c.h));
  });
});

describe('import stats line', () => {
  const s = {
    colors: 4,
    beads: 231,
    pruned: 0,
    ms: 67,
    background: 'none' as const,
    ringsFixed: 0,
  };
  const tr = (key: MessageKey | PluralKey, params?: Params) => t('en', key, params);

  it('formats the stats with a lower-case background', () => {
    expect(importStatsText(s, tr)).toBe(
      '4 colours · 231 beads · 0 pruned · background: none (whole image) · 67 ms',
    );
  });

  it('appends fixed rings with plurals', () => {
    expect(importStatsText({ ...s, ringsFixed: 1 }, tr)).toMatch(/ · 1 ring fixed$/);
    expect(importStatsText({ ...s, ringsFixed: 2 }, tr)).toMatch(/ · 2 rings fixed$/);
    expect(importStatsText({ ...s, ringsFixed: 2 }, (k, p) => t('sv', k, p))).toMatch(
      / · 2 ringar rättade$/,
    );
  });
});
