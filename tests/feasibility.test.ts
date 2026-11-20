import { describe, expect, it } from 'vitest';
import { analyse } from '../src/core/analyse';
import {
  BEAD_STATUS,
  beadStatus,
  chooseLadder,
  prune,
  resolveLadder,
  supportedMask,
  warnings,
} from '../src/core/feasibility';
import { hOf } from '../src/core/geometry';
import type { ColorId, Pattern } from '../src/core';
import { buildInstructions } from '../src/core/instructions';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import liten from './fixtures/liten.rows.json';
import liten10 from './fixtures/liten10.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

/** Test oracle: literal port of `ripa3/lib.py:_prune` (fixpoint over `"r,h"` keys). */
function naivePrune(p: Pattern, lad: number): Set<string> {
  const B = new Set<string>();
  p.cells.forEach((row, r) =>
    row.forEach((c, i) => {
      if (c !== null) B.add(`${r},${hOf(r, i)}`);
    }),
  );
  const rows = [...new Set([...B].map((k) => Number(k.split(',')[0])))].sort((a, b) => a - b);
  let ch = true;
  while (ch) {
    ch = false;
    for (const r of rows) {
      if (r === lad) continue;
      const rr = r < lad ? r + 1 : r - 1;
      for (const k of [...B].filter((k) => Number(k.split(',')[0]) === r)) {
        const h = Number(k.split(',')[1]);
        if (!B.has(`${rr},${h - 1}`) && !B.has(`${rr},${h + 1}`)) {
          B.delete(k);
          ch = true;
        }
      }
    }
  }
  return B;
}

function maskKeys(mask: readonly Uint8Array[]): Set<string> {
  const out = new Set<string>();
  mask.forEach((row, r) =>
    row.forEach((v, i) => {
      if (v) out.add(`${r},${hOf(r, i)}`);
    }),
  );
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomShaped(rnd: () => number): Pattern {
  const width = 2 + Math.floor(rnd() * 10);
  const height = 1 + Math.floor(rnd() * 12);
  const fill = 0.3 + rnd() * 0.6;
  const rows = Array.from({ length: height }, (_, r) =>
    Array.from({ length: r % 2 === 0 ? width : width - 1 }, () => (rnd() < fill ? 'A' : '.')).join(
      '',
    ),
  );
  return shaped(rows);
}

const count = (mask: readonly Uint8Array[]): number =>
  mask.reduce((n, row) => n + row.reduce((m, v) => m + (v ? 1 : 0), 0), 0);

const withLadder = (p: Pattern, row: number): Pattern => ({
  ...p,
  ladder: { kind: 'manual', row },
});

const cascade = (): Pattern => shaped(['A.....', 'AAAA.', '...AAA']);
const overhang = (): Pattern => shaped(['.AAAAAA.A', '...AAA..']);
const diagonal = (n: number): Pattern =>
  shaped(['...A.', '..A.', '..A..', '.A..', 'AAAAA'].map((s, r) => (r < 4 - n ? '.' : s)));

describe('supportedMask', () => {
  it('equals the naive prototype fixpoint on 200 random shaped patterns', () => {
    const rnd = mulberry32(20261118);
    for (let k = 0; k < 200; k++) {
      const p = randomShaped(rnd);
      const lad = Math.floor(rnd() * p.height);
      expect(maskKeys(supportedMask(p, lad))).toEqual(naivePrune(p, lad));
    }
  });

  it('ripa4 kept beads per ladder row', () => {
    const p = fromRhJson(ripa4);
    const kept = p.cells.map((_, L) => count(supportedMask(p, L)));
    expect(kept).toEqual([
      217,
      ...Array<number>(7).fill(219),
      254,
      254,
      ...Array<number>(12).fill(268),
      263,
      262,
      254,
      248,
      224,
    ]);
  });
});

describe('chooseLadder', () => {
  it('ripa4 → row 17 (most kept, then widest, then topmost)', () => {
    expect(chooseLadder(fromRhJson(ripa4))).toBe(17);
  });

  it('panels → row 0', () => {
    expect(chooseLadder(fromRowsJson(liten))).toBe(0);
    expect(chooseLadder(fromRowsJson(liten10))).toBe(0);
  });

  it('falls back to all non-empty rows when none is single-segment', () => {
    expect(chooseLadder(shaped(['A.A', 'A.A', 'A.AA.A']))).toBe(2);
  });

  it('empty pattern → null', () => {
    expect(chooseLadder(shaped(['...', '..']))).toBeNull();
  });
});

describe('resolveLadder', () => {
  const p = fromRhJson(ripa4);

  it('auto', () => {
    expect(resolveLadder(p)).toEqual({ row: 17, invalidManual: false });
  });

  it('honours a valid manual row', () => {
    expect(resolveLadder(withLadder(p, 10))).toEqual({ row: 10, invalidManual: false });
  });

  it('invalid manual row → auto + flag', () => {
    expect(resolveLadder(withLadder(p, 99))).toEqual({ row: 17, invalidManual: true });
    expect(resolveLadder(withLadder(shaped(['A..', '..', 'AA.']), 1))).toEqual({
      row: 2,
      invalidManual: true,
    });
  });
});

describe('beadStatus and prune', () => {
  it('overhang d=+5 → needsExtraLadder kept by prune; isolated bead → floating removed', () => {
    const p = overhang();
    const s = beadStatus(p, 1);
    expect([...(s[0] as Uint8Array)]).toEqual([
      BEAD_STATUS.empty,
      BEAD_STATUS.extraLadder,
      BEAD_STATUS.extraLadder,
      BEAD_STATUS.supported,
      BEAD_STATUS.supported,
      BEAD_STATUS.supported,
      BEAD_STATUS.supported,
      BEAD_STATUS.empty,
      BEAD_STATUS.floating,
    ]);
    const q = prune(p, 1);
    expect(q.cells[0]).toEqual([null, 'A', 'A', 'A', 'A', 'A', 'A', null, null]);
    expect(q.cells[1]).toEqual(p.cells[1]);
    expect(prune(q, 1)).toEqual(q);
  });

  it('cascade: a bead resting on an extra-ladder bead is anchored, not floating', () => {
    const p = cascade();
    const s = beadStatus(p, 2);
    const { supported: S, extraLadder: X, empty: E } = BEAD_STATUS;
    expect([...(s[0] as Uint8Array)]).toEqual([X, E, E, E, E, E]);
    expect([...(s[1] as Uint8Array)]).toEqual([X, X, S, S, E]);
    expect(prune(p, 2)).toEqual(p);
    expect(warnings(p, 2).filter((w) => w.code === 'floating')).toEqual([]);
  });

  it('anchoring propagates along a row segment from a bead with an anchored support', () => {
    const p = shaped(['AA....', 'AAAA.', '...AAA']);
    expect([...(beadStatus(p, 2)[0] as Uint8Array)].slice(0, 2)).toEqual([
      BEAD_STATUS.extraLadder,
      BEAD_STATUS.extraLadder,
    ]);
  });

  it('prune keeps ⊇ the naive supported set, and equals it without extra-ladder beads', () => {
    const rnd = mulberry32(20261119);
    let equalCases = 0;
    for (let k = 0; k < 200; k++) {
      const p = randomShaped(rnd);
      const lad = Math.floor(rnd() * p.height);
      const kept = maskKeys(prune(p, lad).cells.map((row) => Uint8Array.from(row, (c) => +!!c)));
      const naive = naivePrune(p, lad);
      for (const key of naive) expect(kept.has(key)).toBe(true);
      const extra = beadStatus(p, lad).some((row) => row.includes(BEAD_STATUS.extraLadder));
      if (!extra) {
        expect(kept).toEqual(naive);
        equalCases++;
      }
    }
    expect(equalCases).toBeGreaterThan(0);
  });

  it('never removes ladder beads, even split ones', () => {
    const p = shaped(['A.A', '..']);
    expect(prune(p, 0)).toEqual(p);
  });

  it('returns the same pattern when nothing floats', () => {
    const p = fromRhJson(ripa4);
    expect(prune(p, 17).cells).toEqual(p.cells);
  });
});

describe('analyse', () => {
  it('ripa4 auto: matches the separate calls', () => {
    const p = fromRhJson(ripa4);
    const a = analyse(p);
    expect(a.ladderRow).toBe(17);
    expect(a.invalidManual).toBe(false);
    expect(a.status).toEqual(beadStatus(p, 17));
    expect(a.warnings).toEqual(warnings(p, 17));
    expect(a.instructions).toEqual(buildInstructions(p, 17));
  });

  it('explicit ladder row overrides the pattern choice', () => {
    const p = withLadder(fromRhJson(ripa4), 99);
    const a = analyse(p, 10);
    expect(a).toMatchObject({ ladderRow: 10, invalidManual: false });
    expect(a.warnings).toEqual(warnings(p, 10));
  });

  it('flags an invalid manual ladder', () => {
    expect(analyse(withLadder(fromRhJson(ripa4), 99))).toMatchObject({
      ladderRow: 17,
      invalidManual: true,
    });
  });

  it('empty pattern: no ladder, no instructions', () => {
    const a = analyse(shaped(['...', '..']));
    expect(a.ladderRow).toBeNull();
    expect(a.warnings).toEqual([]);
    expect(a.instructions).toBeUndefined();
  });
});

describe('warnings', () => {
  it('overhang', () => {
    expect(warnings(overhang(), 1)).toEqual([
      { code: 'needsExtraLadder', r: 0, h: 2 },
      { code: 'needsExtraLadder', r: 0, h: 4 },
      { code: 'floating', r: 0, h: 16 },
      { code: 'segments', r: 0, value: 2 },
    ]);
  });

  it('ripa4: only leg segments, no thinLine, beak supported', () => {
    expect(warnings(fromRhJson(ripa4), 17)).toEqual([
      { code: 'segments', r: 23, value: 2 },
      { code: 'segments', r: 24, value: 3 },
      { code: 'segments', r: 25, value: 3 },
      { code: 'segments', r: 26, value: 2 },
    ]);
  });

  it('4-bead diagonal from a wide ladder → exactly one thinLine (3-row chain)', () => {
    const w = warnings(diagonal(4), 4);
    expect(w.filter((x) => x.code === 'thinLine')).toEqual([
      { code: 'thinLine', r: 2, h: 4, value: 3 },
    ]);
    expect(w.filter((x) => x.code !== 'thinLine')).toEqual([]);
  });

  it('3-bead diagonal → 2-row chain, no thinLine', () => {
    expect(warnings(diagonal(3), 4)).toEqual([]);
  });

  it('single-bead ladder vertical zigzag → one chain on each side', () => {
    const p = shaped(['.A.', 'A.', '.A.', 'A.', '.A.', 'A.', '.A.']);
    const thin = warnings(p, 3).filter((x) => x.code === 'thinLine');
    expect(thin).toEqual([
      { code: 'thinLine', r: 2, h: 2, value: 3 },
      { code: 'thinLine', r: 4, h: 2, value: 3 },
    ]);
  });

  it('panels: none; a gap → panelGaps', () => {
    const p = fromRowsJson(liten);
    expect(warnings(p, 0)).toEqual([]);
    const cells = p.cells.map((row) => [...row]);
    (cells[5] as (ColorId | null)[])[3] = null;
    const gaps = warnings({ ...p, cells }, 0);
    expect(gaps.filter((x) => x.code === 'panelGaps')).toEqual([{ code: 'panelGaps', r: 5, h: 7 }]);
  });
});
