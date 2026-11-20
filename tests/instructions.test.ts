import { describe, expect, it } from 'vitest';
import { BEAD_STATUS } from '../src/core/feasibility';
import {
  beadTable,
  buildInstructions,
  extraLadderNotes,
  loopPoint,
} from '../src/core/instructions';
import type { Pattern, RowNote } from '../src/core';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import liten from './fixtures/liten.rows.json';
import liten10 from './fixtures/liten10.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';
import red from './fixtures/red_rh.json';

const short = (n: RowNote): string => {
  switch (n.kind) {
    case 'ladderStart':
      return 'L';
    case 'parts':
      return `P${n.count}`;
    case 'extraLadder':
      return `X${n.count}${n.side[0]?.toUpperCase()}`;
    default:
      return `${n.kind === 'increase' ? '+' : '-'}${n.count}${n.side === 'left' ? 'L' : 'R'}`;
  }
};

/** `ripa4/page.py:note` output for ladder row 17 (0-based), keyed by 0-based row. */
const RIPA4_NOTES: Record<number, string> = {
  0: '-1R',
  2: '+1L +1R',
  3: '+1L',
  4: '+1L',
  6: '+1L',
  7: '-2R',
  9: '+1L -1R',
  12: '+1L',
  14: '+1L',
  15: '+1L',
  17: 'L',
  18: '+1R',
  19: '+1R',
  20: '+1R',
  21: '+1R',
  22: '-1L +1R',
  23: '+1R P2',
  24: 'P3',
  25: 'P3',
  26: '+1L -6R P2',
};

const range = (a: number, b: number, step = 1): number[] =>
  Array.from({ length: Math.abs(b - a) / Math.abs(step) + 1 }, (_, k) => a + k * step);

describe('buildInstructions: ripa4', () => {
  const p = fromRhJson(ripa4);
  const ins = buildInstructions(p, 17);

  it('order: ladder, up to the top, then down', () => {
    expect(ins.ladderRow).toBe(17);
    expect(ins.order.map((x) => x.rowNumber)).toEqual([...range(18, 1, -1), ...range(19, 27)]);
  });

  it('notes match the prototype; beak row is increase 1, not extraLadder', () => {
    const got: Record<number, string> = {};
    ins.order.forEach((x) => {
      if (x.notes.length) got[x.rowNumber - 1] = x.notes.map(short).join(' ');
    });
    expect(got).toEqual(RIPA4_NOTES);
  });

  it('runs per segment, counts, totals, size', () => {
    const row24 = ins.order.find((x) => x.rowNumber === 24);
    expect(row24).toMatchObject({ count: 12 });
    expect(row24?.segments).toEqual([
      [
        { color: 'W', length: 1 },
        { color: 'G', length: 5 },
      ],
      [
        { color: 'W', length: 2 },
        { color: 'K', length: 4 },
      ],
    ]);
    expect(ins.totalBeads).toBe(268);
    expect(ins.sizeMm.width).toBeCloseTo(29.6);
    expect(ins.sizeMm.height).toBeCloseTo(35.1);
  });

  it('loop: topmost bead within half a bead of the centroid (prototype (8,-24))', () => {
    expect(ins.loop).toEqual({ r: 8, h: 14 });
  });
});

describe('buildInstructions: edge notes', () => {
  it('step in d=-3 → 1, d=-5 → 2, d=-7 → 3', () => {
    const ins = buildInstructions(shaped(['AAAAAAAAA', '.AAAA...', '....A....']), 0);
    expect(ins.order.map((x) => x.notes)).toEqual([
      [{ kind: 'ladderStart' }],
      [
        { kind: 'stepIn', side: 'left', count: 1 },
        { kind: 'stepIn', side: 'right', count: 3 },
      ],
      [{ kind: 'stepIn', side: 'left', count: 2 }],
    ]);
  });

  it('overhang d=+5 → increase 1 (supported bead) plus extraLadder k−1 = 2', () => {
    const ins = buildInstructions(shaped(['.AAAAAA..', '...AAA..']), 1);
    expect(ins.order[1]?.notes).toEqual([
      { kind: 'increase', side: 'left', count: 1 },
      { kind: 'increase', side: 'right', count: 1 },
      { kind: 'extraLadder', side: 'left', count: 2 },
    ]);
  });

  it('row with no supported beads: extra-ladder beads are labelled left, increase dropped', () => {
    const { extraLadder: X, empty: E } = BEAD_STATUS;
    expect(extraLadderNotes(Uint8Array.from([E, X, X, E]))).toEqual([
      { kind: 'extraLadder', side: 'left', count: 2 },
    ]);
  });

  it('bridge over a gap → inner extraLadder with bead count', () => {
    const ins = buildInstructions(shaped(['.AAA.', 'A..A']), 1);
    expect(ins.order[1]?.notes).toEqual([{ kind: 'extraLadder', side: 'inner', count: 1 }]);
  });

  it('cascade: a bead on an extra-ladder bead is anchored and noted, not dropped', () => {
    const ins = buildInstructions(shaped(['A.....', 'AAAA.', '...AAA']), 2);
    expect(ins.order.map((x) => x.notes)).toEqual([
      [{ kind: 'ladderStart' }],
      [
        { kind: 'increase', side: 'left', count: 1 },
        { kind: 'stepIn', side: 'right', count: 1 },
        { kind: 'extraLadder', side: 'left', count: 2 },
      ],
      [
        { kind: 'stepIn', side: 'right', count: 3 },
        { kind: 'extraLadder', side: 'left', count: 1 },
      ],
    ]);
  });

  it('skips empty rows in numbering and order', () => {
    const ins = buildInstructions(shaped(['.....', '....', 'AAAAA', '.AA.']), 2);
    expect(ins.order.map((x) => x.rowNumber)).toEqual([1, 2]);
  });
});

describe('buildInstructions: panels', () => {
  it('liten: no edge notes (R14), loop mid top row, size', () => {
    const ins = buildInstructions(fromRowsJson(liten), 0);
    expect(ins.order.map((x) => x.rowNumber)).toEqual(range(1, 22));
    expect(ins.order.flatMap((x) => x.notes)).toEqual([{ kind: 'ladderStart' }]);
    expect(ins.loop).toEqual({ r: 0, h: 10 });
    expect(ins.totalBeads).toBe(231);
    expect(ins.sizeMm.width).toBeCloseTo(17.6);
    expect(ins.sizeMm.height).toBeCloseTo(28.6);
    expect(ins.order[1]?.segments).toEqual([[{ color: 'R', length: 10 }]]);
  });

  it('liten10 (even width): left-of-centre bead of the top row, as the prototype', () => {
    expect(buildInstructions(fromRowsJson(liten10), 0).loop).toEqual({ r: 0, h: 8 });
  });
});

describe('loopPoint', () => {
  it('null when empty or no bead near the centroid', () => {
    expect(loopPoint(shaped(['...', '..']))).toBeNull();
    expect(loopPoint(shaped(['A...A']))).toBeNull();
  });
});

describe('beadTable', () => {
  const table = (p: Pattern) =>
    Object.fromEntries(
      beadTable(p).rows.map((x) => [x.color.id, [x.perEarring, x.perPair]] as const),
    );

  it('liten', () => {
    const t = beadTable(fromRowsJson(liten));
    expect(t.total).toBe(231);
    expect(t.totalPair).toBe(462);
    expect(table(fromRowsJson(liten))).toEqual({
      R: [69, 138],
      B: [128, 256],
      G: [17, 34],
      Y: [17, 34],
    });
  });

  it('red_rh: W227 G19 K20 R2', () => {
    expect(table(fromRhJson(red))).toEqual({
      W: [227, 454],
      G: [19, 38],
      K: [20, 40],
      R: [2, 4],
    });
  });

  it('omits palette colours with no beads, keeps palette order', () => {
    const p = fromRhJson(red);
    const extra = { id: 'Z', hex: '#000000' };
    const t = beadTable({ ...p, palette: [...p.palette, extra] });
    expect(t.rows.map((x) => x.color.id)).toEqual(p.palette.map((x) => x.id));
  });
});
