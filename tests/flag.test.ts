import { describe, expect, it } from 'vitest';
import { colourCounts, paletteEntryFromSeed, SEED_CATALOG, type Pattern } from '../src/core';
import { DEFAULT_SETTINGS, analyseImage, type AnalysisTarget } from '../src/core/analysis';
import { foregroundMask } from '../src/core/analysis/prepare';
import { samiFlag } from './flag';

const catalogue = SEED_CATALOG.map((s) => paletteEntryFromSeed(s, s.db));
const ID = { R: 'DB-723', G: 'DB-724', Y: 'DB-721', B: 'DB-726' } as const;

const counts = (p: Pattern) => {
  const c = colourCounts(p);
  return Object.fromEntries(Object.entries(ID).map(([k, id]) => [k, c.get(id) ?? 0])) as Record<
    keyof typeof ID,
    number
  >;
};

const panel: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 19, height: 30 };
const shapedT: AnalysisTarget = { beadType: 'delica11', mode: 'shaped', width: 28, height: 20 };

describe('full-bleed Sami flag with auto background', () => {
  it('resolves auto to none for a multi-colour border', () => {
    expect(foregroundMask(samiFlag(), DEFAULT_SETTINGS).mode).toBe('none');
  });

  for (const [name, target] of [
    ['panel 19x30', panel],
    ['shaped 28x20', shapedT],
  ] as const)
    it(`keeps the blue field (${name})`, () => {
      const r = analyseImage(samiFlag(), target, catalogue, DEFAULT_SETTINGS);
      const c = counts(r.pattern);
      const beads = r.pattern.cells.flat().filter((x) => x !== null).length;
      expect(r.stats.background).toBe('none');
      expect(c.B / beads).toBeGreaterThan(0.3);
      expect(Object.values(c).every((n) => n > 0)).toBe(true);
      expect(r.usedPalette.map((e) => e.id).sort()).toEqual(Object.values(ID).sort());
      if (target.mode === 'panel') expect(r.pattern.cells.flat()).not.toContain(null);
    });

  it('also keeps the blue field with the reported settings (tolerance 29, s=0.55)', () => {
    const s = { ...DEFAULT_SETTINGS, borderKeyTolerance: 29, lineSensitivity: 0.55 };
    const c = counts(analyseImage(samiFlag(), shapedT, catalogue, s).pattern);
    expect(c.B).toBeGreaterThan(c.R);
  });
});

describe('rotated Sami flag', () => {
  it('rotated 90° into panel 11x22 puts the red field at the top', () => {
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };
    const r = analyseImage(samiFlag(), t, catalogue, { ...DEFAULT_SETTINGS, rotation: 90 });
    const meanRow = (id: string): number => {
      const rows = r.pattern.cells.flatMap((row, i) => row.filter((c) => c === id).map(() => i));
      return rows.reduce((a, b) => a + b, 0) / rows.length;
    };
    expect(meanRow(ID.R)).toBeLessThan(meanRow(ID.G));
    expect(meanRow(ID.G)).toBeLessThan(meanRow(ID.Y));
    expect(meanRow(ID.Y)).toBeLessThan(meanRow(ID.B));
    expect(
      r.pattern.cells
        .slice(0, 11)
        .flat()
        .filter((c) => c === ID.R).length,
    ).toBeGreaterThan(30);
  });
});

describe('rotated Sami flag with auto fit', () => {
  it('stretches into panel 11x22 without fill margin rows', () => {
    const t: AnalysisTarget = { beadType: 'delica11', mode: 'panel', width: 11, height: 22 };
    const r = analyseImage(samiFlag(), t, catalogue, { ...DEFAULT_SETTINGS, rotation: 90 });
    const rows = r.pattern.cells;
    expect(rows[0]!.every((c) => c === ID.R)).toBe(true);
    expect(rows[1]!.every((c) => c === ID.R)).toBe(true);
    expect(rows[rows.length - 1]!.every((c) => c === ID.B)).toBe(true);
  });
});
