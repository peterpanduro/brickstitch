import { describe, expect, it } from 'vitest';
import {
  SEED_CATALOG,
  colourLabel,
  deltaE2000,
  hexToLab,
  hexToRgb,
  nearest,
  nearestIndex,
  paletteEntryFromSeed,
  rgbToLab,
  seedByDb,
  seedName,
} from '../src/core/palette';
import type { PaletteEntry } from '../src/core/palette';
import sharma from './fixtures/sharma2005.json';

describe('colour conversion', () => {
  it('parses hex', () => {
    expect(hexToRgb('#F7F7F5')).toEqual([247, 247, 245]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('converts sRGB to Lab (D65)', () => {
    const w = rgbToLab([255, 255, 255]);
    expect(w.L).toBeCloseTo(100, 2);
    expect(w.a).toBeCloseTo(0, 2);
    expect(w.b).toBeCloseTo(0, 2);
    const red = hexToLab('#ff0000');
    expect(red.L).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
    expect(hexToLab('#000000').L).toBeCloseTo(0, 6);
  });
});

describe('deltaE2000 (Sharma, Wu, Dalal 2005)', () => {
  it('has 34 reference pairs', () => expect(sharma).toHaveLength(34));
  it.each(sharma)('pair $pair', ({ lab1, lab2, dE }) => {
    expect(Math.abs(deltaE2000(lab1, lab2) - dE)).toBeLessThan(1e-4);
    expect(Math.abs(deltaE2000(lab2, lab1) - dE)).toBeLessThan(1e-4);
  });
});

describe('nearest', () => {
  const mk = (id: string, hex: string): PaletteEntry => ({ id, hex });
  const entries = [mk('a', '#ff0000'), mk('b', '#00ff00'), mk('c', '#ff0000')];

  it('picks the closest entry', () => {
    expect(nearest(hexToLab('#fe1010'), entries).id).toBe('a');
    expect(nearest(hexToLab('#10fe10'), entries).id).toBe('b');
  });

  it('breaks ties by first', () => {
    expect(nearest(hexToLab('#ff0000'), entries).id).toBe('a');
  });

  it('throws on empty', () => {
    expect(() => nearest(hexToLab('#ffffff'), [])).toThrow();
  });

  it('nearestIndex uses ΔE2000, not ΔE76, on precomputed Labs', () => {
    const target = { L: 50, a: 0, b: -60 };
    const labs = [
      { L: 60, a: 0, b: -60 },
      { L: 50, a: 0, b: -80 },
    ];
    const de76 = labs.map((x) => Math.hypot(x.L - target.L, x.a - target.a, x.b - target.b));
    expect(de76[0]).toBeLessThan(de76[1]!);
    expect(nearestIndex(target, labs)).toBe(1);
    expect(nearestIndex(target, [])).toBe(-1);
  });
});

describe('seed catalog', () => {
  it('contains the SPEC §6 colours first and every researched colour', () => {
    expect(SEED_CATALOG.slice(0, 7).map((s) => s.db)).toEqual([
      'DB-200',
      'DB-010',
      'DB-1139',
      'DB-723',
      'DB-726',
      'DB-724',
      'DB-721',
    ]);
    expect(SEED_CATALOG).toHaveLength(40);
    expect(seedByDb('DB-2286')).toBeUndefined();
    for (const s of SEED_CATALOG) {
      expect(s.db).toMatch(/^DB-\d+$/);
      expect(s.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(s.approximate).toBe(true);
      expect(s.names.sv.trim()).not.toBe('');
      expect(s.names.en.trim()).not.toBe('');
    }
  });

  it('flags only DB-2105 as dyed; unknowns stay undefined', () => {
    expect(SEED_CATALOG.filter((s) => s.dyed).map((s) => s.db)).toEqual(['DB-2105']);
    expect(seedByDb('DB-2274')?.dyed).toBeUndefined();
    expect(seedByDb('DB-200')?.dyed).toBe(false);
  });

  it('looks up seeds and localised names by DB number', () => {
    expect(seedByDb('DB-724')?.hex).toBe('#2F8A30');
    expect(seedName('DB-200', 'sv')).toBe('Vit');
    expect(seedName('DB-200', 'en')).toBe('White');
    expect(seedName('DB-9999', 'en')).toBeUndefined();
  });

  it('has unique DB numbers', () => {
    expect(new Set(SEED_CATALOG.map((s) => s.db)).size).toBe(SEED_CATALOG.length);
  });

  it('builds entries without name', () => {
    const seed = SEED_CATALOG[0]!;
    const e = paletteEntryFromSeed(seed, 'c1');
    expect(e).toEqual({ id: 'c1', db: 'DB-200', hex: seed.hex, approximate: true });
    expect('name' in e).toBe(false);
  });
});

describe('colourLabel', () => {
  it('prefers user name, then db, then seed name by hex, then hex', () => {
    expect(colourLabel({ id: '1', name: 'Snö', db: 'DB-200', hex: '#ffffff' }, 'sv')).toBe('Snö');
    expect(colourLabel({ id: '1', db: 'DB-200', hex: '#ffffff' }, 'sv')).toBe('DB-200');
    expect(colourLabel({ id: '1', hex: '#F7F7F5' }, 'sv')).toBe('Vit');
    expect(colourLabel({ id: '1', hex: '#f7f7f5' }, 'en')).toBe('White');
    expect(colourLabel({ id: '1', hex: '#123456' }, 'en')).toBe('#123456');
  });
});
