import { describe, expect, it } from 'vitest';
import { sliderFill } from '../../src/ui/state/slider';

describe('sliderFill', () => {
  it('is the value position as a fraction of the range', () => {
    expect(sliderFill(0.5, 0.3, 0.7)).toBe('0.5');
    expect(sliderFill(11, 1, 81)).toBe('0.125');
    expect(sliderFill(1, 0, 3)).toBe('0.3333');
  });

  it('clamps outside the range and handles an empty range', () => {
    expect(sliderFill(-1, 0, 1)).toBe('0');
    expect(sliderFill(2, 0, 1)).toBe('1');
    expect(sliderFill(3, 3, 3)).toBe('0');
  });
});
