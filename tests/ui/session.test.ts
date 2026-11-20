import { describe, expect, it } from 'vitest';
import {
  analyseImage,
  createPattern,
  DEFAULT_SETTINGS,
  paletteEntryFromSeed,
  seedByDb,
  serialise,
  type RgbaImage,
  type Warning,
} from '../../src/core';
import { createEditor, current, undoEdit } from '../../src/ui/state/editor';
import { buildNewPattern, type NewPatternChoice } from '../../src/ui/state/new-pattern';
import { errorKey } from '../../src/ui/state/errors';
import {
  addColorAndSelect,
  consumeShowWarningRequest,
  cycleWarning,
  emptyCycle,
  hasRealPattern,
  isDirty,
  newFromImport,
  newNeedsConfirm,
  openText,
  startNewPattern,
} from '../../src/ui/state/session';
import { normalizeHex } from '../../src/ui/state/palette';
import { cycleIndex, rovingTarget } from '../../src/ui/state/roving';

const pal = [{ id: 'w', db: 'DB-200', hex: '#F7F7F5' }];
const p = createPattern({
  beadType: 'delica11',
  mode: 'shaped',
  width: 3,
  height: 2,
  palette: pal,
});

describe('dirty and New confirmation', () => {
  it('restored or edited work is dirty until saved', () => {
    expect(isDirty(null, p)).toBe(true);
    expect(isDirty(p, p)).toBe(false);
    expect(isDirty(p, { ...p })).toBe(true);
  });

  it('New confirms when dirty or when stored data failed to load', () => {
    expect(newNeedsConfirm({ dirty: false, loadError: false })).toBe(false);
    expect(newNeedsConfirm({ dirty: true, loadError: false })).toBe(true);
    expect(newNeedsConfirm({ dirty: false, loadError: true })).toBe(true);
  });

  it('startNewPattern replaces the pattern as one undo step', () => {
    const s = startNewPattern(createEditor(p), {
      beadType: 'delica15',
      mode: 'panel',
      width: 4,
      height: 2,
      background: 'DB-200',
    });
    expect(current(s).beadType).toBe('delica15');
    expect(s.history.past).toEqual([p]);
  });
});

describe('openText', () => {
  it('replaces the pattern as one undo step', () => {
    const r = openText(createEditor(p), serialise({ ...p, title: 'x' }, 't', new Date(0)));
    expect(r.error).toBeNull();
    expect(current(r.state).title).toBe('x');
    expect(r.state.history.past).toHaveLength(1);
  });

  it('returns the parse error and keeps the state', () => {
    const s = createEditor(p);
    expect(openText(s, '{')).toEqual({ state: s, error: 'json' });
  });
});

describe('addColorAndSelect', () => {
  it('adds and selects, reusing an existing DB entry', () => {
    const s = addColorAndSelect(createEditor(p), { db: 'DB-010', hex: '#1C1C1C' });
    expect(s.color).toBe('c1');
    expect(current(s).palette).toHaveLength(2);
    const again = addColorAndSelect(s, { db: 'DB-200', hex: '#F7F7F5' });
    expect(again.color).toBe('w');
    expect(current(again).palette).toHaveLength(2);
  });
});

describe('cycleWarning', () => {
  const ws: Warning[] = [
    { code: 'floating', r: 1, h: 1 },
    { code: 'floating', r: 2, h: 2 },
    { code: 'segments', r: 3, value: 2 },
  ];

  it('steps through warnings of a code and focuses whole rows for row warnings', () => {
    let c = emptyCycle();
    let f;
    ({ cycle: c, focus: f } = cycleWarning(c, ws, 'floating'));
    expect(f).toEqual({ r: 1, h: 1 });
    ({ cycle: c, focus: f } = cycleWarning(c, ws, 'floating'));
    expect(f).toEqual({ r: 2, h: 2 });
    expect(cycleWarning(c, ws, 'segments').focus).toEqual({ r: 3, h: null });
  });

  it('restarts when the warnings change', () => {
    let { cycle } = cycleWarning(emptyCycle(), ws, 'floating');
    ({ cycle } = cycleWarning(cycle, ws, 'floating'));
    const changed = ws.slice(1);
    expect(cycleWarning(cycle, changed, 'floating').focus).toEqual({ r: 2, h: 2 });
  });
});

describe('errorKey', () => {
  it('maps parse, storage and quota errors to messages', () => {
    expect(errorKey('json')).toBe('parseError.json');
    expect(errorKey('color')).toBe('parseError.color');
    expect(errorKey('storage')).toBe('error.storage');
    expect(errorKey('QuotaExceededError: storage full')).toBe('error.quota');
    expect(errorKey('weird')).toBe('error.unknown');
  });
});

describe('normalizeHex', () => {
  it('accepts #rrggbb or rrggbb, rejects the rest', () => {
    expect(normalizeHex('#A1b2C3')).toBe('#a1b2c3');
    expect(normalizeHex(' a1b2c3 ')).toBe('#a1b2c3');
    expect(normalizeHex('#abc')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
  });
});

describe('rovingTarget', () => {
  const numbers = [null, 1, 2, null, 3];
  it('moves between numbered rows with arrows, Home and End', () => {
    expect(rovingTarget(numbers, 1, 'ArrowDown')).toBe(2);
    expect(rovingTarget(numbers, 2, 'ArrowDown')).toBe(4);
    expect(rovingTarget(numbers, 4, 'ArrowDown')).toBe(4);
    expect(rovingTarget(numbers, 4, 'ArrowUp')).toBe(2);
    expect(rovingTarget(numbers, 2, 'Home')).toBe(1);
    expect(rovingTarget(numbers, 1, 'End')).toBe(4);
    expect(rovingTarget(numbers, 1, 'x')).toBeNull();
  });
});

function disc(): RgbaImage {
  const n = 40;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if ((x - 20) ** 2 + (y - 20) ** 2 < 150) data.set([28, 28, 28, 255], (y * n + x) * 4);
  return { width: n, height: n, data };
}

describe('newFromImport (R53)', () => {
  const choice: NewPatternChoice = {
    beadType: 'delica11',
    mode: 'panel',
    width: 9,
    height: 12,
    background: 'DB-723',
  };
  const target = { beadType: 'delica11' as const, mode: 'panel' as const, width: 9, height: 12 };
  const fresh = buildNewPattern(choice);
  const analysis = () =>
    analyseImage(disc(), target, fresh.palette, { ...DEFAULT_SETTINGS, panelBackground: 'c1' });

  it('is one undo step back to the previous pattern', () => {
    const s = newFromImport(createEditor(p), choice, analysis(), target);
    expect(s.history.past).toEqual([p]);
    expect(current(undoEdit(s))).toBe(p);
  });

  it('starts from the choice palette with the Grundfärg as panel background', () => {
    const next = current(newFromImport(createEditor(p), choice, analysis(), target));
    expect(next.palette.slice(0, 2).map((e) => e.db)).toEqual(['DB-723', 'DB-010']);
    expect(next.cells[0]?.[0]).toBe('c1');
    expect(next.cells.flat()).toContain('c2');
    expect([next.mode, next.width, next.height]).toEqual(['panel', 9, 12]);
    const red = seedByDb('DB-723');
    expect(red && paletteEntryFromSeed(red, 'c1').hex).toBe(next.palette[0]?.hex);
  });
});

describe('show-warning request (R48)', () => {
  it('is consumed once', () => {
    const first = consumeShowWarningRequest('floating');
    expect(first).toEqual({ code: 'floating', next: null });
    expect(consumeShowWarningRequest(first.next)).toEqual({ code: null, next: null });
  });
});

describe('hasRealPattern (R55)', () => {
  it('is false for the untouched starter and after a load error', () => {
    expect(hasRealPattern({ restored: false, loadError: false, touched: false })).toBe(false);
    expect(hasRealPattern({ restored: false, loadError: true, touched: false })).toBe(false);
  });

  it('is true after a restore or an edit, open or new', () => {
    expect(hasRealPattern({ restored: true, loadError: false, touched: false })).toBe(true);
    expect(hasRealPattern({ restored: false, loadError: false, touched: true })).toBe(true);
    expect(hasRealPattern({ restored: false, loadError: true, touched: true })).toBe(true);
  });
});

describe('cycleIndex', () => {
  it('moves with arrows (wrapping) and jumps with Home/End', () => {
    expect(cycleIndex(4, 0, 'ArrowDown')).toBe(1);
    expect(cycleIndex(4, 3, 'ArrowDown')).toBe(0);
    expect(cycleIndex(4, 0, 'ArrowUp')).toBe(3);
    expect(cycleIndex(4, 1, 'ArrowRight')).toBe(2);
    expect(cycleIndex(4, 1, 'ArrowLeft')).toBe(0);
    expect(cycleIndex(4, 2, 'Home')).toBe(0);
    expect(cycleIndex(4, 0, 'End')).toBe(3);
    expect(cycleIndex(4, -1, 'ArrowDown')).toBe(0);
    expect(cycleIndex(4, 0, 'Enter')).toBeNull();
    expect(cycleIndex(0, 0, 'ArrowDown')).toBeNull();
  });
});
