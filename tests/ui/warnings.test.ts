import { describe, expect, it } from 'vitest';
import type { Warning } from '../../src/core';
import { fileSlug, patternFile } from '../../src/ui/state/file';
import { warningAt } from '../../src/ui/state/warnings';

const ws: Warning[] = [
  { code: 'floating', r: 3, h: 5 },
  { code: 'floating', r: 4, h: 4 },
  { code: 'segments', r: 2, value: 2 },
];

describe('warningAt', () => {
  it('cycles through warnings of one code', () => {
    expect(warningAt(ws, 'floating', 0)).toEqual(ws[0]);
    expect(warningAt(ws, 'floating', 3)).toEqual(ws[1]);
    expect(warningAt(ws, 'thinLine', 0)).toBeUndefined();
  });
});

describe('fileSlug', () => {
  it('makes a safe file stem', () => {
    expect(fileSlug('Ripa örhänge #4')).toBe('ripa-orhange-4');
    expect(fileSlug('Søster Æble Straße Đak Łódź')).toBe('soster-aeble-strasse-dak-lodz');
    expect(fileSlug('  ')).toBe('pattern');
  });

  it('patternFile names the download after the title', () => {
    const p = {
      title: 'Ripa',
      description: '',
      beadType: 'delica11',
      mode: 'shaped',
      width: 2,
      height: 1,
      palette: [],
      cells: [[null, null]],
      ladder: { kind: 'auto' },
    } as const;
    const f = patternFile(p, '0.1.0', new Date(0));
    expect(f.name).toBe('ripa.brickstitch.json');
    expect(JSON.parse(f.text).savedAt).toBe('1970-01-01T00:00:00.000Z');
  });
});
