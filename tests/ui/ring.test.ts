import { describe, expect, it, vi } from 'vitest';
import {
  BEAD_TYPES,
  createPattern,
  getCell,
  hOf,
  ringCandidates,
  ringKey,
  type Coord,
  type Pattern,
  type RingCandidate,
} from '../../src/core';
import { createEditor, current, undoEdit } from '../../src/ui/state/editor';
import {
  initRingTool,
  memoRingSearch,
  nudgeAnchor,
  placeRingEdit,
  placesOnRelease,
  ringRadioTarget,
  ringSelectedIndex,
  sameAnchor,
  resnapAnchor,
  ringAnchor,
  ringPreview,
  ringSearchParams,
  selectRingCandidate,
  setRingCentred,
  setRingThickness,
  setRingWidth,
} from '../../src/ui/state/ring';
import { fromRowsJson } from '../adapters';
import liten from '../fixtures/liten.rows.json';
import liten10 from '../fixtures/liten10.rows.json';

const pal = [
  { id: 'R', db: 'DB-723', hex: '#C1272D' },
  { id: 'B', db: 'DB-726', hex: '#1F3A93' },
];
const panel = (width = 11, height = 22): Pattern =>
  createPattern({ beadType: 'delica11', mode: 'panel', width, height, palette: pal, fill: 'R' });
const shaped = (): Pattern =>
  createPattern({ beadType: 'delica11', mode: 'shaped', width: 20, height: 28, palette: pal });

/** Cells whose colour is `c`. */
const cellsOf = (p: Pattern, c: string): Coord[] =>
  p.cells.flatMap((row, r) => row.flatMap((v, i) => (v === c ? [{ r, h: hOf(r, i) }] : [])));

const t = BEAD_TYPES.delica11;
/** Lattice-local mm of the centre of row `r` at `x`. */
const rowY = (r: number) => (r + 0.5) * t.rowPitchMm;

describe('ring tool state', () => {
  it('defaults to min(9, W − 2) wide, clamped to 3..30, centred, first candidate', () => {
    expect(initRingTool(panel(11))).toEqual({
      widthBeads: 9,
      thicknessMm: null,
      centreH: true,
      selected: 0,
    });
    expect(initRingTool(panel(9)).widthBeads).toBe(7);
    expect(initRingTool(panel(4)).widthBeads).toBe(3);
  });

  it('clamps and rounds the width and resets the selection', () => {
    const s = selectRingCandidate(initRingTool(panel()), 2);
    expect(s.selected).toBe(2);
    expect(setRingWidth(s, 40)).toMatchObject({ widthBeads: 30, selected: 0 });
    expect(setRingWidth(s, 1).widthBeads).toBe(3);
    expect(setRingWidth(s, 7.4).widthBeads).toBe(7);
    expect(setRingWidth(s, NaN)).toBe(s);
  });

  it('accepts only a valid thickness range; null restores the default', () => {
    const s = initRingTool(panel());
    expect(setRingThickness(s, { min: 0.6, max: 0.8 }).thicknessMm).toEqual({ min: 0.6, max: 0.8 });
    expect(setRingThickness(s, { min: 0.8, max: 0.6 })).toBe(s);
    expect(setRingThickness(s, { min: 0, max: 0.6 })).toBe(s);
    expect(setRingThickness(s, { min: NaN, max: 0.6 })).toBe(s);
    expect(setRingThickness(setRingThickness(s, { min: 0.6, max: 0.8 }), null).thicknessMm).toBe(
      null,
    );
  });

  it('ignores negative or fractional candidate indices', () => {
    const s = initRingTool(panel());
    expect(selectRingCandidate(s, -1)).toBe(s);
    expect(selectRingCandidate(s, 1.5)).toBe(s);
  });
});

describe('ringSearchParams', () => {
  it('filters to on-bead centres only on a centred panel', () => {
    const s = initRingTool(panel());
    const centres = ringSearchParams(panel(), s).centres;
    expect(centres).toEqual([
      { onBead: true, onRow: true },
      { onBead: true, onRow: false },
    ]);
    expect(ringSearchParams(panel(), setRingCentred(s, false)).centres).toBeUndefined();
    expect(ringSearchParams(shaped(), s).centres).toBeUndefined();
  });

  it('passes bead type, width and thickness', () => {
    const p = { ...panel(), beadType: 'delica15' as const };
    const s = setRingThickness(setRingWidth(initRingTool(p), 12), { min: 0.6, max: 0.7 });
    expect(ringSearchParams(p, s)).toMatchObject({
      beadType: 'delica15',
      targetWidthBeads: 12,
      thicknessMm: { min: 0.6, max: 0.7 },
    });
    expect(ringSearchParams(p, initRingTool(p)).thicknessMm).toBeUndefined();
  });
});

describe('memoRingSearch', () => {
  it('runs the search once per (beadType, width, thickness, centres)', () => {
    const search = vi.fn((): RingCandidate[] => []);
    const memo = memoRingSearch(search);
    const a = memo({ beadType: 'delica11', targetWidthBeads: 9 });
    expect(memo({ beadType: 'delica11', targetWidthBeads: 9 })).toBe(a);
    memo({ beadType: 'delica11', targetWidthBeads: 8 });
    memo({ beadType: 'delica11', targetWidthBeads: 9, centres: [{ onBead: true, onRow: true }] });
    memo({ beadType: 'delica11', targetWidthBeads: 9, thicknessMm: { min: 0.6, max: 0.7 } });
    expect(search).toHaveBeenCalledTimes(4);
    memo({ beadType: 'delica11', targetWidthBeads: 9 });
    expect(search).toHaveBeenCalledTimes(4);
  });

  it('evicts the oldest entry beyond its size', () => {
    const search = vi.fn((): RingCandidate[] => []);
    const memo = memoRingSearch(search, 2);
    for (const w of [3, 4, 5, 3]) memo({ targetWidthBeads: w });
    expect(search).toHaveBeenCalledTimes(4);
  });
});

describe('ringAnchor with centre horizontally', () => {
  const p = panel();
  const s = initRingTool(p);
  const best = (q: Pattern, w: number) =>
    ringCandidates(ringSearchParams(q, setRingWidth(initRingTool(q), w)))[0]!;

  it('snaps the anchor to the middle column, so only the row comes from the pointer', () => {
    const c = best(p, 9);
    for (const x of [0.3, 5, 17.3])
      expect(ringAnchor(p, s, c, x, rowY(8))).toEqual({ r: 8, h: 10 });
  });

  it('picks the nearest row of the right parity (ties: smaller r)', () => {
    const c = { ...best(p, 9), centre: { onBead: true, onRow: true } };
    expect(ringAnchor(p, s, c, 0, rowY(8) + 0.2)).toEqual({ r: 8, h: 10 });
    expect(ringAnchor(p, s, c, 0, rowY(9))).toEqual({ r: 8, h: 10 });
    expect(ringAnchor(p, s, c, 0, rowY(9) + 0.01)).toEqual({ r: 10, h: 10 });
  });

  it('accounts for a centre half a row below the anchor', () => {
    const c = { ...best(p, 9), centre: { onBead: true, onRow: false } };
    expect(ringAnchor(p, s, c, 0, (8 + 1) * t.rowPitchMm)).toEqual({ r: 8, h: 10 });
  });

  it('uses the free anchor when not centring or on a shaped pattern', () => {
    const c = best(p, 9);
    const free = setRingCentred(s, false);
    expect(ringAnchor(p, free, c, 0.8, rowY(0))).toEqual({ r: 0, h: 0 });
    expect(ringAnchor(shaped(), s, c, 0.8, rowY(0))).toEqual({ r: 0, h: 0 });
  });

  it.each([
    ['liten', liten, 9, 3, 13, 8, 30, 4],
    ['liten10', liten10, 7, 3, 11, 7, 24, 3],
  ] as const)('reproduces the %s flag ring', (_n, rows, ringW, r0, r1, row, beads, run) => {
    const golden = fromRowsJson(rows);
    const q = panel(golden.width, golden.height);
    const c = best(q, ringW);
    const anchor = ringAnchor(q, initRingTool(q), c, 0, rowY(row));
    const placed = placeRingEdit({ ...createEditor(q), color: 'B' }, c, anchor);
    expect(placed.clipped).toBe(0);
    expect(c.score).toMatchObject({ beadCount: beads, topRun: run, bottomRun: run });
    expect(ringKey(cellsOf(current(placed.state), 'B'))).toBe(ringKey(goldenRing(golden, r0, r1)));
    expect(cellsOf(current(placed.state), 'B')).toEqual(goldenRing(golden, r0, r1));
  });
});

/** Golden ring: cells in rows r0..r1 whose colour differs from the row's majority colour. */
function goldenRing(p: Pattern, r0: number, r1: number): Coord[] {
  const out: Coord[] = [];
  for (let r = r0; r <= r1; r++) {
    const row = p.cells[r] ?? [];
    const counts = new Map<unknown, number>();
    row.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    const major = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    row.forEach((c, i) => {
      if (c !== major) out.push({ r, h: hOf(r, i) });
    });
  }
  return out;
}

describe('placeRingEdit', () => {
  const p = panel();
  const c = ringCandidates({ targetWidthBeads: 9 })[0]!;

  it('places the ring in the current colour as one undo step', () => {
    const s = { ...createEditor(p), color: 'B' };
    const r = placeRingEdit(s, c, { r: 8, h: 10 });
    expect(r.clipped).toBe(0);
    expect(cellsOf(current(r.state), 'B')).toHaveLength(c.cells.length);
    expect(current(undoEdit(r.state))).toBe(p);
  });

  it('reports clipped beads and paints the rest', () => {
    const s = { ...createEditor(shaped()), color: 'B' };
    const r = placeRingEdit(s, c, { r: 0, h: 0 });
    expect(r.clipped).toBeGreaterThan(0);
    expect(r.placed).toBe(c.cells.length - r.clipped);
    expect(cellsOf(current(r.state), 'B')).toHaveLength(c.cells.length - r.clipped);
    expect(getCell(current(r.state), { r: 0, h: 0 })).toBeNull();
  });

  it('does nothing without a colour, during a stroke or for an invalid anchor', () => {
    const s = createEditor(p);
    expect(placeRingEdit({ ...s, color: null }, c, { r: 8, h: 10 })).toEqual({
      state: { ...s, color: null },
      clipped: 0,
      placed: 0,
    });
    const stroking = { ...s, stroke: { before: p, ladderRow: null } };
    expect(placeRingEdit(stroking, c, { r: 8, h: 10 }).state).toBe(stroking);
    expect(placeRingEdit(s, c, { r: 8, h: 9 }).state).toBe(s);
  });
});

describe('nudgeAnchor', () => {
  it('moves by a bead or a row, keeping lattice parity', () => {
    const a = { r: 4, h: 6 };
    expect(nudgeAnchor(a, 'ArrowLeft', false)).toEqual({ r: 4, h: 4 });
    expect(nudgeAnchor(a, 'ArrowRight', false)).toEqual({ r: 4, h: 8 });
    expect(nudgeAnchor(a, 'ArrowDown', false)).toEqual({ r: 5, h: 5 });
    expect(nudgeAnchor({ r: 5, h: 5 }, 'ArrowDown', false)).toEqual({ r: 6, h: 6 });
    expect(nudgeAnchor({ r: 5, h: 5 }, 'ArrowUp', false)).toEqual(a);
    expect(nudgeAnchor({ r: 6, h: 6 }, 'ArrowUp', false)).toEqual({ r: 5, h: 5 });
    expect(nudgeAnchor(a, 'Enter', false)).toBeNull();
  });

  it('moves two rows and never sideways when centred', () => {
    const a = { r: 8, h: 10 };
    expect(nudgeAnchor(a, 'ArrowDown', true)).toEqual({ r: 10, h: 10 });
    expect(nudgeAnchor(a, 'ArrowUp', true)).toEqual({ r: 6, h: 10 });
    expect(nudgeAnchor(a, 'ArrowLeft', true)).toBeNull();
  });
});

describe('ringPreview', () => {
  it('draws one bead per ring cell inside its view box', () => {
    const c = ringCandidates({ targetWidthBeads: 9 })[0]!;
    const v = ringPreview(c, 'delica11', '#123456');
    expect(v.shapes).toHaveLength(c.cells.length);
    expect(v.shapes.every((s) => s.t === 'bead' && s.fill === '#123456')).toBe(true);
    expect(v.widthMm).toBeCloseTo(c.score.widthMm);
    expect(v.heightMm).toBeCloseTo(c.score.heightMm);
    for (const s of v.shapes) {
      if (s.t !== 'bead') continue;
      expect(s.xMm).toBeGreaterThanOrEqual(v.x);
      expect(s.xMm + s.wMm).toBeLessThanOrEqual(v.x + v.widthMm + 1e-9);
      expect(s.yMm).toBeGreaterThanOrEqual(v.y);
      expect(s.yMm + s.hMm).toBeLessThanOrEqual(v.y + v.heightMm + 1e-9);
    }
  });
});

describe('resnapAnchor', () => {
  const p = panel();
  const c = ringCandidates(ringSearchParams(p, initRingTool(p)))[0]!;

  it('moves an off-centre anchor to the middle column, keeping the nearest allowed row', () => {
    const s = initRingTool(p);
    expect(resnapAnchor(p, s, c, { r: 8, h: 4 })).toEqual({ r: 8, h: 10 });
    expect(resnapAnchor(p, s, c, { r: 7, h: 3 })).toEqual({ r: 6, h: 10 });
  });

  it('keeps the anchor when not centring', () => {
    const a = { r: 7, h: 3 };
    expect(resnapAnchor(p, setRingCentred(initRingTool(p), false), c, a)).toBe(a);
  });
});

describe('ring pointer and selection helpers', () => {
  it('touch places on release; mouse and pen place on press', () => {
    expect(placesOnRelease('touch')).toBe(true);
    expect(placesOnRelease('mouse')).toBe(false);
    expect(placesOnRelease('pen')).toBe(false);
  });

  it('compares anchors by r and h', () => {
    expect(sameAnchor({ r: 1, h: 3 }, { r: 1, h: 3 })).toBe(true);
    expect(sameAnchor({ r: 1, h: 3 }, { r: 1, h: 5 })).toBe(false);
    expect(sameAnchor(null, null)).toBe(true);
    expect(sameAnchor(null, { r: 0, h: 0 })).toBe(false);
  });

  it('clamps the selected index to the candidate count (fallback 0)', () => {
    const s = selectRingCandidate(initRingTool(panel()), 4);
    expect(ringSelectedIndex(s, 6)).toBe(4);
    expect(ringSelectedIndex(s, 3)).toBe(0);
  });

  it('moves through the radiogroup with arrows (wrapping), Home and End', () => {
    expect(ringRadioTarget('ArrowRight', 5, 6)).toBe(0);
    expect(ringRadioTarget('ArrowDown', 1, 6)).toBe(2);
    expect(ringRadioTarget('ArrowLeft', 0, 6)).toBe(5);
    expect(ringRadioTarget('ArrowUp', 3, 6)).toBe(2);
    expect(ringRadioTarget('Home', 3, 6)).toBe(0);
    expect(ringRadioTarget('End', 3, 6)).toBe(5);
    expect(ringRadioTarget('Enter', 3, 6)).toBeNull();
    expect(ringRadioTarget('Home', 0, 0)).toBeNull();
  });
});
