import { describe, expect, it } from 'vitest';
import { matchEntry } from '../src/core/analysis/match';
import { hexToLab, rgbToLab } from '../src/core/palette/color';
import { deltaE2000 } from '../src/core/palette/deltaE';

const entries = ['#717879', '#c27d7b', '#d41f1c', '#f7f7f5', '#2f8a30'];
const labs = entries.map(hexToLab);
const idx = (hex: string): number => entries.indexOf(hex);

describe('matchEntry (R59.5)', () => {
  it('takes the nearest entry by ΔE2000 when nothing is wrong with it', () => {
    const lab = rgbToLab([70, 160, 60]);
    const m = matchEntry(lab, labs);
    expect(m.index).toBe(idx('#2f8a30'));
    expect(m.deltaE).toBeCloseTo(deltaE2000(lab, labs[m.index]!));
  });

  it('does not map a saturated magenta to a neutral grey when a same-hue entry is within reach', () => {
    const lab = rgbToLab([190, 60, 120]);
    expect(nearestIndexOf(lab)).toBe(idx('#717879'));
    expect(matchEntry(lab, labs).index).toBe(idx('#c27d7b'));
  });

  it('keeps a neutral cluster on the neutral entry', () => {
    expect(matchEntry(rgbToLab([120, 125, 126]), labs).index).toBe(idx('#717879'));
  });

  it('falls back to the nearest entry when no same-hue entry is within reach', () => {
    const blue = rgbToLab([40, 60, 200]);
    const m = matchEntry(blue, labs.slice(0, 1));
    expect(m.index).toBe(0);
    expect(m.deltaE).toBeGreaterThan(15);
  });

  it('ignores entries of another hue', () => {
    const only = [labs[0]!, labs[4]!];
    expect(matchEntry(rgbToLab([190, 60, 120]), only).index).toBe(0);
  });
});

function nearestIndexOf(lab: ReturnType<typeof rgbToLab>): number {
  return labs.map((l, i) => [deltaE2000(lab, l), i] as const).sort((a, b) => a[0] - b[0])[0]![1];
}
