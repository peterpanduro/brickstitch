import { describe, expect, it } from 'vitest';
import { createPattern, SEED_CATALOG, type KeyValueStore } from '../../src/core';
import {
  addColor,
  colorChoices,
  gridIndex,
  loadLibrary,
  nextColorId,
  paletteOptionLabel,
  paletteRowLabels,
  popoverTop,
  saveLibrary,
  upsertLibrary,
} from '../../src/ui/state/palette';

const memory = (
  init: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

const base = createPattern({
  beadType: 'delica11',
  mode: 'shaped',
  width: 2,
  height: 1,
  palette: [{ id: 'c1', db: 'DB-200', hex: '#F7F7F5' }],
});

describe('palette helpers', () => {
  it('nextColorId avoids existing ids', () => {
    expect(nextColorId(base)).toBe('c2');
    expect(nextColorId({ ...base, palette: [] })).toBe('c1');
  });

  it('addColor appends with a fresh id and returns the id; existing DB reuses its entry', () => {
    const black = { db: 'DB-010', hex: '#1C1C1C', approximate: true as const };
    const { pattern, id } = addColor(base, black);
    expect(id).toBe('c2');
    expect(pattern.palette[1]).toEqual({ id: 'c2', ...black });
    expect(addColor(pattern, black)).toEqual({ pattern, id: 'c2' });
  });

  it('colorChoices: library first, then seeds, filtered by DB or localised name', () => {
    const lib = [{ id: 'x', name: 'My blue', hex: '#0000FF' }];
    const all = colorChoices('', 'sv', lib);
    expect(all).toHaveLength(SEED_CATALOG.length + 1);
    expect(all[0]?.label).toBe('My blue');
    expect(all[1]).toMatchObject({ label: 'Vit', db: 'DB-200' });
    expect(colorChoices('db-01', 'en', lib).map((c) => c.db)).toContain('DB-010');
    expect(colorChoices('black', 'en', []).every((c) => /black/i.test(c.label))).toBe(true);
    expect(colorChoices('blue', 'en', lib)[0]?.label).toBe('My blue');
  });
});

describe('paletteRowLabels', () => {
  it('puts the localised seed name first and the DB number second', () => {
    expect(paletteRowLabels({ id: 'a', db: 'DB-200', hex: '#F7F7F5' }, 'sv')).toEqual({
      name: 'Vit',
      db: 'DB-200',
      approximate: false,
    });
    expect(paletteRowLabels({ id: 'a', db: 'DB-200', hex: '#F7F7F5' }, 'en').name).toBe('White');
  });

  it('has no DB line when the DB number is the name (unnamed, uncatalogued)', () => {
    const l = paletteRowLabels({ id: 'a', db: 'DB-9999', hex: '#123456' }, 'sv');
    expect(l.name).toBe('DB-9999');
    expect(l).not.toHaveProperty('db');
  });

  it('lets a user name override the seed name', () => {
    const l = paletteRowLabels(
      { id: 'a', db: 'DB-200', name: 'Snö', hex: '#fff', approximate: true },
      'sv',
    );
    expect(l).toEqual({ name: 'Snö', db: 'DB-200', approximate: true });
  });

  it('does not repeat the DB number, and falls back to hex', () => {
    expect(paletteRowLabels({ id: 'a', db: 'DB-9999', hex: '#123456' }, 'sv')).toEqual({
      name: 'DB-9999',
      approximate: false,
    });
    expect(paletteRowLabels({ id: 'a', hex: '#123456' }, 'sv').name).toBe('#123456');
  });
});

describe('paletteOptionLabel', () => {
  it('appends the DB number so repeated names stay distinguishable', () => {
    expect(paletteOptionLabel({ id: 'a', db: 'DB-734', hex: '#452520' }, 'sv')).toBe(
      'Mörkbrun · DB-734',
    );
    expect(paletteOptionLabel({ id: 'a', db: 'DB-1134', hex: '#371B15' }, 'sv')).toBe(
      'Mörkbrun · DB-1134',
    );
    expect(paletteOptionLabel({ id: 'a', db: 'DB-9999', hex: '#123456' }, 'sv')).toBe('DB-9999');
    expect(paletteOptionLabel({ id: 'a', hex: '#123456' }, 'sv')).toBe('#123456');
  });
});

describe('colorChoices filters', () => {
  it('filters by family and combines with the query', () => {
    const reds = colorChoices('', 'sv', [], 'red');
    expect(reds.map((c) => c.db)).toContain('DB-723');
    expect(reds.every((c) => c.family === 'red')).toBe(true);
    expect(colorChoices('röd', 'sv', []).map((c) => c.db)).toContain('DB-723');
    expect(colorChoices('723', 'sv', []).map((c) => c.db)).toEqual(['DB-723']);
    expect(colorChoices('723', 'sv', [], 'blue')).toEqual([]);
    expect(colorChoices('', 'sv', [], 'all')).toHaveLength(SEED_CATALOG.length);
  });

  it('tags library colours with a family', () => {
    const lib = [{ id: 'x', name: 'Blå', hex: '#0000FF' }];
    expect(colorChoices('', 'sv', lib, 'blue')[0]).toMatchObject({ source: 'library' });
  });
});

describe('popoverTop', () => {
  it('aligns to the anchor and clamps inside the viewport', () => {
    expect(popoverTop(200, 300, 900)).toBe(200);
    expect(popoverTop(800, 300, 900)).toBe(584);
    expect(popoverTop(10, 300, 900)).toBe(72);
  });
});

describe('gridIndex', () => {
  it('moves by cell and row, clamped; Home/End jump', () => {
    expect(gridIndex(20, 3, 8, 'ArrowRight')).toBe(4);
    expect(gridIndex(20, 3, 8, 'ArrowDown')).toBe(11);
    expect(gridIndex(20, 15, 8, 'ArrowDown')).toBe(15);
    expect(gridIndex(20, 3, 8, 'ArrowUp')).toBe(3);
    expect(gridIndex(20, 0, 8, 'ArrowLeft')).toBe(0);
    expect(gridIndex(20, 19, 8, 'ArrowRight')).toBe(19);
    expect(gridIndex(20, 5, 8, 'Home')).toBe(0);
    expect(gridIndex(20, 5, 8, 'End')).toBe(19);
    expect(gridIndex(20, 5, 8, 'a')).toBeNull();
    expect(gridIndex(0, 0, 8, 'ArrowDown')).toBeNull();
  });
});

describe('palette library', () => {
  it('round-trips and ignores invalid data', () => {
    const s = memory();
    expect(loadLibrary(s)).toEqual([]);
    const lib = [{ id: 'a', hex: '#123456', name: 'x' }];
    expect(saveLibrary(s, lib)).toEqual({ ok: true });
    expect(loadLibrary(s)).toEqual(lib);
    expect(loadLibrary(memory({ 'bs:v1:palette': '{' }))).toEqual([]);
    expect(loadLibrary(memory({ 'bs:v1:palette': '[{"hex":1}]' }))).toEqual([]);
  });

  it('upsert replaces by db, else by id', () => {
    const lib = upsertLibrary([{ id: 'a', db: 'DB-010', hex: '#000000' }], {
      id: 'z',
      db: 'DB-010',
      hex: '#111111',
    });
    expect(lib).toEqual([{ id: 'z', db: 'DB-010', hex: '#111111' }]);
    expect(upsertLibrary(lib, { id: 'q', hex: '#222222' })).toHaveLength(2);
  });

  it('reports a failed write', () => {
    const s: KeyValueStore = {
      get: () => null,
      set: () => {
        throw new Error('quota');
      },
    };
    expect(saveLibrary(s, [])).toEqual({ ok: false, error: 'quota' });
  });
});
