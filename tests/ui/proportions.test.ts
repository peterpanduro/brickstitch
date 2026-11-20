import { describe, expect, it } from 'vitest';
import { proportionalSize } from '../../src/ui/state/proportions';

const flag = { imgW: 400, imgH: 300, rotation: 0 as const, beadType: 'delica11' as const };

describe('proportionalSize', () => {
  it('4:3 landscape at width 11 on delica11 (11*1.6*3/(4*1.3) = 10.15)', () => {
    expect(proportionalSize({ ...flag, width: 11 })).toEqual({ width: 11, height: 10 });
  });
  it('rotation 90/270 swaps the image sides', () => {
    expect(proportionalSize({ ...flag, rotation: 90, width: 11 })).toEqual({
      width: 11,
      height: 18,
    });
    expect(proportionalSize({ ...flag, rotation: 270, width: 11 }).height).toBe(18);
    expect(proportionalSize({ ...flag, rotation: 180, width: 11 }).height).toBe(10);
  });
  it('delica15 uses its own bead pitch (11*1.3*3/(4*1.15) = 9.33)', () => {
    expect(proportionalSize({ ...flag, beadType: 'delica15', width: 11 }).height).toBe(9);
  });
  it('height drives width the other way', () => {
    expect(proportionalSize({ ...flag, height: 10 })).toEqual({ width: 11, height: 10 });
  });
  it('clamps to 2..80 and 1..120', () => {
    expect(proportionalSize({ ...flag, width: 500 })).toEqual({ width: 80, height: 74 });
    expect(proportionalSize({ ...flag, rotation: 90, width: 80 }).height).toBe(120);
    expect(proportionalSize({ ...flag, width: 2 }).height).toBe(2);
    expect(
      proportionalSize({ imgW: 1000, imgH: 10, rotation: 0, beadType: 'delica11', width: 2 })
        .height,
    ).toBe(1);
    expect(proportionalSize({ ...flag, height: 120 }).width).toBe(80);
    expect(proportionalSize({ ...flag, height: 1 }).width).toBe(2);
  });
});
