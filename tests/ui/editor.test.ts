import { describe, expect, it } from 'vitest';
import { analyse, createPattern, getCell, SEED_CATALOG, type Pattern } from '../../src/core';
import {
  applyEdit,
  autoLadder,
  cancelStroke,
  createEditor,
  current,
  pinnedLadder,
  pointerDown,
  pointerMove,
  pointerUp,
  redoEdit,
  removeUnsupported,
  selectColorIndex,
  setManualLadder,
  setTool,
  undoEdit,
  type EditorState,
} from '../../src/ui/state/editor';

const pal = [
  { id: 'w', db: 'DB-200', hex: '#F7F7F5' },
  { id: 'k', db: 'DB-010', hex: '#1C1C1C' },
];
const panel = (): Pattern =>
  createPattern({
    beadType: 'delica11',
    mode: 'panel',
    width: 4,
    height: 4,
    palette: pal,
    fill: 'w',
  });
const shapedP = (): Pattern =>
  createPattern({ beadType: 'delica11', mode: 'shaped', width: 4, height: 4, palette: pal });

const withColor = (s: EditorState, color: string): EditorState => ({ ...s, color });

describe('editor strokes', () => {
  it('a drag stroke paints several cells as one undo step', () => {
    let s = withColor(createEditor(panel()), 'k');
    s = pointerDown(s, { r: 0, h: 0 });
    s = pointerMove(s, { r: 0, h: 2 });
    s = pointerMove(s, { r: 1, h: 1 });
    s = pointerUp(s);
    const p = current(s);
    expect([
      getCell(p, { r: 0, h: 0 }),
      getCell(p, { r: 0, h: 2 }),
      getCell(p, { r: 1, h: 1 }),
    ]).toEqual(['k', 'k', 'k']);
    s = undoEdit(s);
    expect(getCell(current(s), { r: 0, h: 2 })).toBe('w');
    expect(s.history.past).toHaveLength(0);
    s = redoEdit(s);
    expect(getCell(current(s), { r: 1, h: 1 })).toBe('k');
  });

  it('a stroke that changes nothing records no step', () => {
    let s = withColor(createEditor(panel()), 'w');
    s = pointerUp(pointerMove(pointerDown(s, { r: 0, h: 0 }), { r: 0, h: 2 }));
    expect(s.history.past).toHaveLength(0);
  });

  it('ignores moves without a stroke and undo during a stroke', () => {
    let s = withColor(createEditor(panel()), 'k');
    expect(pointerMove(s, { r: 0, h: 0 })).toBe(s);
    s = pointerDown(s, { r: 0, h: 0 });
    expect(undoEdit(s)).toBe(s);
  });

  it('pins the auto ladder during a stroke (R12) and releases it after', () => {
    let s = withColor(createEditor(shapedP()), 'k');
    s = pointerUp(pointerDown(s, { r: 2, h: 0 }));
    expect(pinnedLadder(s)).toBeUndefined();
    s = pointerDown(s, { r: 0, h: 0 });
    expect(pinnedLadder(s)).toBe(2);
    s = pointerMove(s, { r: 0, h: 2 });
    s = pointerMove(s, { r: 0, h: 4 });
    expect(pinnedLadder(s)).toBe(2);
    s = pointerUp(s);
    expect(pinnedLadder(s)).toBeUndefined();
    expect(analyse(current(s)).ladderRow).toBe(0);
  });

  it('erase empties cells in shaped mode only', () => {
    let s = setTool(createEditor(shapedP()), 'erase');
    s = withColor(s, 'k');
    s = pointerDown(setTool(s, 'paint'), { r: 0, h: 0 });
    s = pointerUp(s);
    s = pointerUp(pointerDown(setTool(s, 'erase'), { r: 0, h: 0 }));
    expect(getCell(current(s), { r: 0, h: 0 })).toBeNull();
    const ps = setTool(createEditor(panel()), 'erase');
    expect(ps.tool).toBe('paint');
  });

  it('eyedropper picks the colour and switches back to paint', () => {
    let s = createEditor(panel());
    s = pointerUp(pointerDown(setTool(s, 'eyedropper'), { r: 1, h: 1 }));
    expect(s.color).toBe('w');
    expect(s.tool).toBe('paint');
    expect(s.history.past).toHaveLength(0);
  });

  it('fill floods a region as one step', () => {
    let s = withColor(setTool(createEditor(panel()), 'fill'), 'k');
    s = pointerUp(pointerDown(s, { r: 0, h: 0 }));
    expect(
      current(s)
        .cells.flat()
        .every((c) => c === 'k'),
    ).toBe(true);
    expect(s.history.past).toHaveLength(1);
  });

  it('keys 1–9 select palette entries by position', () => {
    const s = createEditor(panel());
    expect(selectColorIndex(s, 2).color).toBe('k');
    expect(selectColorIndex(s, 9)).toBe(s);
  });
});

describe('editor pattern edits', () => {
  it('manual ladder and auto reset are undoable', () => {
    let s = createEditor(panel());
    s = applyEdit(s, (p) => setManualLadder(p, 2));
    expect(current(s).ladder).toEqual({ kind: 'manual', row: 2 });
    s = applyEdit(s, autoLadder);
    expect(current(s).ladder).toEqual({ kind: 'auto' });
    expect(current(undoEdit(s)).ladder.kind).toBe('manual');
  });

  it('remove unsupported prunes floating beads in shaped mode as one step', () => {
    let s = withColor(createEditor(shapedP()), 'k');
    for (const c of [
      { r: 0, h: 0 },
      { r: 0, h: 2 },
      { r: 0, h: 4 },
      { r: 3, h: 5 },
    ]) {
      s = pointerUp(pointerDown(s, c));
    }
    const before = s.history.past.length;
    s = applyEdit(s, removeUnsupported);
    expect(getCell(current(s), { r: 3, h: 5 })).toBeNull();
    expect(s.history.past.length).toBe(before + 1);
    const pp = panel();
    expect(removeUnsupported(pp)).toBe(pp);
  });

  it('keeps the current colour valid when the palette changes', () => {
    let s = withColor(createEditor(panel()), 'k');
    s = applyEdit(s, (p) => ({ ...p, palette: p.palette.filter((e) => e.id !== 'k') }));
    expect(s.color).toBe('w');
  });

  it('starts with the first palette colour', () => {
    const seedPal = [{ id: 'a', db: SEED_CATALOG[0]?.db, hex: '#ffffff' }];
    const p = createPattern({
      beadType: 'delica11',
      mode: 'shaped',
      width: 2,
      height: 1,
      palette: seedPal,
    });
    expect(createEditor(p).color).toBe('a');
  });
});

describe('cancelStroke', () => {
  it('restores stroke.before and adds no history entry', () => {
    let s = withColor(createEditor(panel()), 'k');
    s = applyEdit(s, (p) => ({ ...p, title: 'x' }));
    const before = current(s);
    const past = s.history.past;
    s = pointerMove(pointerDown(s, { r: 0, h: 0 }), { r: 0, h: 2 });
    s = cancelStroke(s);
    expect(s.stroke).toBeNull();
    expect(current(s)).toBe(before);
    expect(s.history.past).toBe(past);
    expect(s.history.future).toEqual([]);
    expect(pointerUp(s)).toBe(s);
  });

  it('is a no-op without a stroke', () => {
    const s = createEditor(panel());
    expect(cancelStroke(s)).toBe(s);
  });
});
