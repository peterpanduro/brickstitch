import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  initHistory,
  push,
  record,
  redo,
  replacePresent,
  undo,
} from '../../src/ui/state/history';

describe('history', () => {
  it('push/undo/redo', () => {
    let h = push(push(initHistory(1), 2), 3);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = push(h, 9);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores a push of the identical present and no-op undo/redo', () => {
    const h = initHistory({ a: 1 });
    expect(push(h, h.present)).toBe(h);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('caps depth at 100 by default', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 150; i++) h = push(h, i);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]).toBe(50);
  });

  it('record turns a replaced present into one step from `before`', () => {
    let h = initHistory('a');
    h = replacePresent(h, 'b');
    h = replacePresent(h, 'c');
    expect(h.past).toEqual([]);
    h = record(h, 'a');
    expect(h.past).toEqual(['a']);
    expect(undo(h).present).toBe('a');
    expect(record(initHistory('x'), 'x').past).toEqual([]);
  });
});
