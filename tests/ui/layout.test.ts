import { describe, expect, it } from 'vitest';
import {
  HINT_KEY,
  hintSeen,
  layoutFor,
  markHintSeen,
  touchViewPad,
} from '../../src/ui/state/layout';
import { VIEW_PAD } from '../../src/ui/state/zoom';

describe('layoutFor', () => {
  it('desktop ≥ 1024, tablet 600–1023, phone < 600', () => {
    expect(layoutFor(1440)).toBe('desktop');
    expect(layoutFor(1024)).toBe('desktop');
    expect(layoutFor(1023)).toBe('tablet');
    expect(layoutFor(600)).toBe('tablet');
    expect(layoutFor(599)).toBe('phone');
    expect(layoutFor(320)).toBe('phone');
  });
});

describe('touchViewPad', () => {
  it('desktop keeps VIEW_PAD; touch layouts reserve less room', () => {
    expect(touchViewPad('desktop')).toBe(VIEW_PAD);
    const tablet = touchViewPad('tablet');
    const phone = touchViewPad('phone');
    expect(tablet.right).toBeLessThan(VIEW_PAD.right);
    expect(phone.left).toBeLessThan(tablet.left);
    expect(phone.right).toBeLessThan(tablet.right);
  });
});

describe('first-use hint', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => m.set(k, v), m };
  };

  it('is unseen until marked, then remembered', () => {
    const s = store();
    expect(hintSeen(s)).toBe(false);
    markHintSeen(s);
    expect(s.m.get(HINT_KEY)).toBe('1');
    expect(hintSeen(s)).toBe(true);
  });

  it('storage errors are a convenience failure, not a crash', () => {
    const broken = {
      get: () => {
        throw new Error('blocked');
      },
      set: () => {
        throw new Error('quota');
      },
    };
    expect(hintSeen(broken)).toBe(false);
    expect(() => markHintSeen(broken)).not.toThrow();
  });
});
