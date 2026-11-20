import { describe, expect, it } from 'vitest';
import { analyse, createPattern, diagramScene, type Pattern } from '../../src/core';
import {
  drawnLayout,
  motifBox,
  motifSizeMm,
  pairLayout,
  REAL_SIZE_BOX,
} from '../../src/ui/state/real-size';

const W = { id: 'w', db: 'DB-200', hex: '#F7F7F5' };

function shaped(width: number, height: number, fill: (r: number, i: number) => boolean): Pattern {
  const p = createPattern({ beadType: 'delica11', mode: 'shaped', width, height, palette: [W] });
  return { ...p, cells: p.cells.map((row, r) => row.map((_, i) => (fill(r, i) ? 'w' : null))) };
}

describe('pairLayout (R49)', () => {
  const desk = REAL_SIZE_BOX.desktop;

  it('uses the R49 boxes', () => {
    expect(REAL_SIZE_BOX).toEqual({
      desktop: { width: 54, height: 70 },
      tablet: { width: 40, height: 60 },
    });
  });

  it('shows a pair when two copies fit side by side', () => {
    expect(pairLayout({ width: 17.6, height: 28.6 }, desk)).toBe('pair');
  });

  it('falls back to a single copy, then none', () => {
    expect(pairLayout({ width: 50, height: 60 }, desk)).toBe('single');
    expect(pairLayout({ width: 54, height: 70 }, desk)).toBe('single');
    expect(pairLayout({ width: 24, height: 36 }, desk)).toBe('pair');
    expect(pairLayout({ width: 25, height: 36 }, desk)).toBe('single');
    expect(pairLayout({ width: 55, height: 36 }, desk)).toBe('none');
    expect(pairLayout({ width: 80 * 1.6, height: 120 * 1.3 }, desk)).toBe('none');
    expect(pairLayout({ width: 20, height: 71 }, desk)).toBe('none');
  });

  it('works for the tablet box', () => {
    expect(pairLayout({ width: 17.6, height: 28.6 }, REAL_SIZE_BOX.tablet)).toBe('single');
    expect(pairLayout({ width: 16, height: 26 }, REAL_SIZE_BOX.tablet)).toBe('pair');
  });
});

describe('motif size', () => {
  it('uses the instructions size (motif), else the canvas size', () => {
    const p = shaped(10, 10, (r, i) => r >= 2 && r < 5 && i < 3);
    const a = analyse(p);
    expect(motifSizeMm(p, a)).toEqual(a.instructions?.sizeMm);
    expect(motifSizeMm(p, a).width).toBeLessThan(16);
    const empty = shaped(10, 10, () => false);
    const size = motifSizeMm(empty, analyse(empty));
    expect(size.width).toBeCloseTo(16);
    expect(size.height).toBeCloseTo(13);
  });

  it('motifBox bounds the beads of a bare scene', () => {
    const p = shaped(10, 10, (r, i) => r >= 2 && r < 5 && i < 3);
    const box = motifBox(diagramScene(p, analyse(p), {}));
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(2 * 1.3 - 0.5);
    expect(box!.height).toBeLessThan(3 * 1.3 + 0.01);
    expect(
      motifBox(
        diagramScene(
          shaped(4, 4, () => false),
          analyse(shaped(4, 4, () => false)),
          {},
        ),
      ),
    ).toBeNull();
  });
});

describe('drawnLayout (R49)', () => {
  it('lays out the drawn box (beads and loop), not the motif size', () => {
    const p = shaped(3, 20, (_r, i) => i === 0);
    const a = analyse(p);
    const scene = diagramScene(p, a, { loop: true });
    const drawn = motifBox(scene)!;
    const motif = motifSizeMm(p, a);
    expect(drawn.height).toBeGreaterThan(motif.height);
    const box = { width: 54, height: (motif.height + drawn.height) / 2 };
    expect(pairLayout(motif, box)).not.toBe('none');
    expect(drawnLayout(scene, box)).toBe('none');
  });

  it('is null without beads and a pair for a small motif', () => {
    const empty = shaped(4, 4, () => false);
    expect(
      drawnLayout(diagramScene(empty, analyse(empty), { loop: true }), REAL_SIZE_BOX.desktop),
    ).toBeNull();
    const small = shaped(10, 10, (r, i) => r >= 2 && r < 8 && i < 6);
    expect(
      drawnLayout(diagramScene(small, analyse(small), { loop: true }), REAL_SIZE_BOX.desktop),
    ).toBe('pair');
  });
});
