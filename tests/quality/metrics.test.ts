import { describe, expect, it } from 'vitest';
import {
  dominantColour,
  maskIou,
  meanOf,
  nearestHex,
  percentile,
  regionRecall,
  tallyRegions,
} from './metrics';

describe('percentile / meanOf', () => {
  it('picks the rank from the sorted values', () => {
    expect(percentile([5, 1, 3, 2, 4, 9, 8, 7, 6, 10], 0.9)).toBe(10);
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(percentile([], 0.9)).toBe(0);
  });
  it('averages, 0 when empty', () => {
    expect(meanOf([1, 2, 6])).toBe(3);
    expect(meanOf([])).toBe(0);
  });
});

describe('tallyRegions / dominantColour', () => {
  const beads = [
    { region: 0, colour: '#fff' },
    { region: 1, colour: '#f00' },
    { region: 1, colour: '#f00' },
    { region: 1, colour: '#0f0' },
  ];
  it('counts colours per region', () => {
    const t = tallyRegions(beads, 3);
    expect([...t[1]!]).toEqual([
      ['#f00', 2],
      ['#0f0', 1],
    ]);
    expect(t[2]!.size).toBe(0);
  });
  it('returns the most frequent colour, null for an empty tally', () => {
    const t = tallyRegions(beads, 3);
    expect(dominantColour(t[1]!)).toBe('#f00');
    expect(dominantColour(t[2]!)).toBeNull();
  });
});

describe('regionRecall', () => {
  const tally = new Map([
    ['#f00', 3],
    ['#00f', 1],
  ]);
  it('is the share of beads with the expected colour', () => {
    expect(regionRecall(tally, '#f00', '#fff')).toBe(0.75);
  });
  it('is 0 when the expected colour is the enclosing region’s colour', () => {
    expect(regionRecall(tally, '#f00', '#f00')).toBe(0);
  });
  it('is 0 for an empty region', () => {
    expect(regionRecall(new Map(), '#f00', '#fff')).toBe(0);
  });
});

describe('nearestHex', () => {
  it('returns the palette colour closest in ΔE2000', () => {
    expect(nearestHex([250, 20, 20], ['#ffffff', '#ff0000', '#0000ff'])).toBe('#ff0000');
  });
});

describe('maskIou', () => {
  const gt = Int16Array.from([0, 1, 1, 2]);
  it('is 1 for a perfect mask', () => {
    expect(maskIou(Uint8Array.from([0, 1, 1, 1]), gt, [1, 2])).toBe(1);
  });
  it('is intersection over union', () => {
    expect(maskIou(Uint8Array.from([1, 1, 0, 0]), gt, [1, 2])).toBeCloseTo(1 / 4);
  });
});
