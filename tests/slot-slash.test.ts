import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import { SCENE_STYLE, sceneToSvg, shapeElements, type Shape } from '../src/core';
import { drawShapes } from '../src/export-pdf/draw';

const SLOT: Shape = { t: 'slot', r: 0, h: 0, xMm: 1, yMm: 2, wMm: 1.44, hMm: 1.14 };
const WHITE: Shape = {
  t: 'bead',
  r: 0,
  h: 2,
  xMm: 3,
  yMm: 2,
  wMm: 1.44,
  hMm: 1.14,
  fill: '#ffffff',
};

/** Fake jsPDF recording drawing calls and the stroke state at each. */
function recorder() {
  const calls: { op: string; args: unknown[]; draw: string; width: number }[] = [];
  let draw = '#000000';
  let width = 0;
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args, draw, width });
    };
  const doc = {
    setDrawColor: (c: string) => void (draw = c),
    setLineWidth: (w: number) => void (width = w),
    setFillColor: () => {},
    setLineDashPattern: () => {},
    setFont: () => {},
    setFontSize: () => {},
    setTextColor: () => {},
    roundedRect: rec('roundedRect'),
    line: rec('line'),
    rect: rec('rect'),
    circle: rec('circle'),
    triangle: rec('triangle'),
    text: rec('text'),
  };
  return { doc: doc as unknown as jsPDF, calls };
}

describe('empty-cell slash', () => {
  it('SVG: a slot is an outline plus a thin light-grey slash, bottom-left to top-right', () => {
    const els = shapeElements(SLOT);
    const line = els.find((e) => e.tag === 'line');
    expect(line?.attrs.stroke).toBe(SCENE_STYLE.slotSlash);
    expect(line?.attrs['stroke-width']).toBe(SCENE_STYLE.stroke.slotSlash);
    const { x1, y1, x2, y2 } = line?.attrs as { x1: number; y1: number; x2: number; y2: number };
    expect(x1).toBeLessThan(x2);
    expect(y1).toBeGreaterThan(y2);
    expect(x1).toBeGreaterThan(1);
    expect(x2).toBeLessThan(1 + 1.44);
    expect(
      sceneToSvg({ ...emptyScene(), rows: [{ r: 0, cells: [null], marks: '', shapes: [SLOT] }] }),
    ).toContain('<line');
  });

  it('PDF: a slot draws its outline and the same slash', () => {
    const { doc, calls } = recorder();
    drawShapes(doc, [SLOT], { x0: 0, y0: 0, s: 1 });
    const line = calls.find((c) => c.op === 'line');
    expect(line?.draw).toBe(SCENE_STYLE.slotSlash);
    expect(line?.args).toEqual(
      ['x1', 'y1', 'x2', 'y2']
        .map((k) => (shapeElements(SLOT)[1]?.attrs as Record<string, number>)[k])
        .map((v) => expect.closeTo(v as number, 3)),
    );
    expect(calls.some((c) => c.op === 'roundedRect' && c.draw === SCENE_STYLE.slot)).toBe(true);
  });

  it('white beads keep a visible non-white outline in SVG and PDF', () => {
    const rect = shapeElements(WHITE)[0];
    expect(rect?.attrs.stroke).not.toBe('#ffffff');
    expect(Number(rect?.attrs['stroke-width'])).toBeGreaterThan(0);
    const { doc, calls } = recorder();
    drawShapes(doc, [WHITE], { x0: 0, y0: 0, s: 1 });
    const bead = calls.find((c) => c.op === 'roundedRect');
    expect(bead?.args[6]).toBe('FD');
    expect(bead?.draw).toBe(SCENE_STYLE.beadStroke);
    expect(bead?.width).toBeGreaterThanOrEqual(0.1);
  });
});

function emptyScene() {
  return {
    widthMm: 10,
    heightMm: 10,
    origin: { x: 0, y: 0 },
    gutterLeftMm: 0,
    background: [],
    rows: [],
    overlay: [],
    layoutKey: '',
    palette: [],
  };
}
