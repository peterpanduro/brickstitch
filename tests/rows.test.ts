import { describe, expect, it } from 'vitest';
import { allRows, rowInfo, rowNumbers } from '../src/core/pattern/rows';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import liten from './fixtures/liten.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

describe('rowInfo', () => {
  it('splits a row into maximal segments with h bounds and colours', () => {
    const p = shaped(['..AB.C...', 'AA..BB..']);
    expect(rowInfo(p, 0)).toEqual({
      r: 0,
      count: 3,
      left: 4,
      right: 10,
      segments: [
        { hStart: 4, hEnd: 6, colors: ['A', 'B'] },
        { hStart: 10, hEnd: 10, colors: ['C'] },
      ],
    });
    expect(rowInfo(p, 1)).toMatchObject({ left: 1, right: 11, count: 4 });
  });

  it('empty row has no extents', () => {
    const info = rowInfo(shaped(['...', '..']), 1);
    expect(info).toEqual({ r: 1, count: 0, segments: [] });
  });

  it('ripa4 segment counts in the legs', () => {
    const rows = allRows(fromRhJson(ripa4));
    expect(rows).toHaveLength(27);
    expect(rows.map((x) => x.segments.length).slice(22)).toEqual([1, 2, 3, 3, 2]);
    expect(rows[17]).toMatchObject({ count: 15, segments: [{ hStart: 1, hEnd: 29 }] });
  });

  it('panel rows alternate W and W-1', () => {
    const rows = allRows(fromRowsJson(liten));
    expect(rows.slice(0, 2).map((x) => x.count)).toEqual([11, 10]);
  });
});

describe('rowNumbers', () => {
  it('numbers non-empty rows 1-based from the topmost non-empty row', () => {
    const p = shaped(['...', '..', 'A..', '..', 'AA.']);
    expect(rowNumbers(p)).toEqual([null, null, 1, null, 2]);
  });
});
