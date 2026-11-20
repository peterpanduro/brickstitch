import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '../../src/core';
import { COLOUR_FAMILIES, colourFamily } from '../../src/ui/state/colour-family';

const family = (db: string) => {
  const s = SEED_CATALOG.find((c) => c.db === db);
  if (!s) throw new Error(db);
  return colourFamily(s.hex);
};

describe('colourFamily', () => {
  it('gives every catalogue colour exactly one listed family', () => {
    for (const s of SEED_CATALOG) {
      expect(COLOUR_FAMILIES.filter((f) => f === colourFamily(s.hex))).toHaveLength(1);
    }
  });

  it('classifies references', () => {
    expect(['DB-200', 'DB-010', 'DB-1139'].map(family)).toEqual(['grey', 'grey', 'grey']);
    expect(family('DB-723')).toBe('red');
    expect(family('DB-726')).toBe('blue');
    expect(family('DB-724')).toBe('green');
    expect(family('DB-734')).toBe('brown');
    expect(family('DB-721')).toBe('yellow');
  });

  it('keeps dark saturated reds red and brown for muted or orange-dark hues', () => {
    expect(colourFamily('#800000')).toBe('red');
    expect(colourFamily('#8B0000')).toBe('red');
    expect(colourFamily('#7B3F00')).toBe('brown');
    expect(colourFamily('#5C4033')).toBe('brown');
    expect(colourFamily('#B22222')).toBe('red');
    expect(colourFamily('#A0522D')).toBe('brown');
  });

  it('is deterministic and case-insensitive', () => {
    expect(colourFamily('#D41F1C')).toBe(colourFamily('#d41f1c'));
  });
});
