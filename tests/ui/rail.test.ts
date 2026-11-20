import { describe, expect, it } from 'vitest';
import { railKeyTarget, railTools } from '../../src/ui/state/rail';

describe('railTools', () => {
  it('lists Sudda only on shaped patterns', () => {
    expect(railTools('shaped').map((t) => t.id)).toEqual([
      'paint',
      'erase',
      'fill',
      'eyedropper',
      'ring',
    ]);
    expect(railTools('panel').map((t) => t.id)).toEqual(['paint', 'fill', 'eyedropper', 'ring']);
  });

  it('gives every tool a label and a hint key under rail.*', () => {
    for (const t of railTools('shaped')) {
      expect(t.label).toBe(`rail.${t.id}`);
      expect(t.hint).toBe(`rail.hint.${t.id}`);
    }
  });
});

describe('railKeyTarget', () => {
  const ids = railTools('shaped').map((t) => t.id);
  it('steps with arrows, wraps, and jumps with Home/End', () => {
    expect(railKeyTarget(ids, 'paint', 'ArrowDown')).toBe('erase');
    expect(railKeyTarget(ids, 'ring', 'ArrowDown')).toBe('paint');
    expect(railKeyTarget(ids, 'paint', 'ArrowUp')).toBe('ring');
    expect(railKeyTarget(ids, 'fill', 'Home')).toBe('paint');
    expect(railKeyTarget(ids, 'fill', 'End')).toBe('ring');
    expect(railKeyTarget(ids, 'fill', 'x')).toBeNull();
  });
});
