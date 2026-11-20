import { describe, expect, it } from 'vitest';
import {
  RELEASE_MS,
  sliderHighlight,
  type ActiveSlider,
  type Timers,
} from '../../src/ui/state/highlight';

/** Manual clock: `tick(ms)` runs due timers in order. */
function fakeTimers(): Timers & { tick: (ms: number) => void; pending: () => number } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => void due.delete(id as number),
    tick: (ms) => {
      now += ms;
      for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at))
        if (t.at <= now) {
          due.delete(id);
          t.fn();
        }
    },
    pending: () => due.size,
  };
}

function setup() {
  const timers = fakeTimers();
  const seen: (ActiveSlider | null)[] = [];
  const h = sliderHighlight((s) => seen.push(s), timers);
  return { h, timers, seen };
}

describe('sliderHighlight', () => {
  it('starts inactive', () => {
    expect(setup().h.active).toBeNull();
  });

  it('is active from press until the release delay has passed', () => {
    const { h, timers, seen } = setup();
    h.press('edge');
    expect(h.active).toBe('edge');
    timers.tick(5000);
    expect(h.active).toBe('edge');
    h.release('edge');
    timers.tick(RELEASE_MS - 1);
    expect(h.active).toBe('edge');
    timers.tick(1);
    expect(h.active).toBeNull();
    expect(seen).toEqual(['edge', null]);
  });

  it('cancels a pending release when pressed again', () => {
    const { h, timers, seen } = setup();
    h.press('lines');
    h.release('lines');
    timers.tick(RELEASE_MS / 2);
    h.press('lines');
    timers.tick(RELEASE_MS * 2);
    expect(h.active).toBe('lines');
    expect(seen).toEqual(['lines']);
  });

  it('switches directly to another slider', () => {
    const { h, timers, seen } = setup();
    h.press('edge');
    h.release('edge');
    h.press('lines');
    timers.tick(RELEASE_MS * 2);
    expect(h.active).toBe('lines');
    expect(seen).toEqual(['edge', 'lines']);
  });

  it('ignores a release of a slider that is not active', () => {
    const { h, timers } = setup();
    h.press('lines');
    h.release('edge');
    timers.tick(RELEASE_MS * 2);
    expect(h.active).toBe('lines');
    expect(timers.pending()).toBe(0);
  });

  it('pulse (keyboard change) shows the highlight for the release delay, extended by each pulse', () => {
    const { h, timers, seen } = setup();
    h.pulse('edge');
    expect(h.active).toBe('edge');
    timers.tick(RELEASE_MS - 100);
    h.pulse('edge');
    timers.tick(RELEASE_MS - 1);
    expect(h.active).toBe('edge');
    timers.tick(1);
    expect(h.active).toBeNull();
    expect(seen).toEqual(['edge', null]);
    expect(timers.pending()).toBe(0);
  });

  it('dispose clears pending timers', () => {
    const { h, timers } = setup();
    h.pulse('lines');
    h.dispose();
    expect(timers.pending()).toBe(0);
  });
});
