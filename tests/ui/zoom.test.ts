import { describe, expect, it } from 'vitest';
import {
  canvasPadding,
  startRowMm,
  displayScale,
  fitScale,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  PX_PER_MM,
  toggleRealSize,
  TOOL_CARD,
  VIEW_PAD,
  zoomBy,
  wheelZoom,
  zoomPercent,
} from '../../src/ui/state/zoom';

describe('zoomPercent', () => {
  it('is 100 at real size, whatever the zoom', () => {
    expect(zoomPercent({ zoom: 'fit', realSize: true }, 12)).toBe(100);
    expect(zoomPercent({ zoom: 30, realSize: true }, 12)).toBe(100);
  });

  it('rounds scale / (96/25.4) for a numeric zoom', () => {
    expect(PX_PER_MM).toBeCloseTo(96 / 25.4);
    expect(zoomPercent({ zoom: PX_PER_MM, realSize: false }, 5)).toBe(100);
    expect(zoomPercent({ zoom: 10, realSize: false }, 5)).toBe(Math.round((10 / PX_PER_MM) * 100));
  });

  it('uses the passed fit scale for fit', () => {
    expect(zoomPercent({ zoom: 'fit', realSize: false }, 7.56)).toBe(200);
  });
});

describe('zoomBy', () => {
  it('starts from the fit scale and turns real size off', () => {
    expect(zoomBy({ zoom: 'fit', realSize: false }, 8, 1.25)).toEqual({
      zoom: 10,
      realSize: false,
    });
  });

  it('starts from the numeric zoom', () => {
    expect(zoomBy({ zoom: 10, realSize: false }, 8, 0.5)).toEqual({ zoom: 5, realSize: false });
  });

  it('starts from the displayed real-size scale', () => {
    const v = zoomBy({ zoom: 30, realSize: true }, 8, 1.25);
    expect(v.realSize).toBe(false);
    expect(v.zoom).toBeCloseTo(PX_PER_MM * 1.25);
  });

  it('clamps to 1–80 px/mm', () => {
    expect([MIN_SCALE, MAX_SCALE]).toEqual([1, 80]);
    expect(zoomBy({ zoom: 70, realSize: false }, 8, 1.25).zoom).toBe(80);
    expect(zoomBy({ zoom: 1.1, realSize: false }, 8, 0.8).zoom).toBe(1);
  });
});

describe('view actions', () => {
  it('"Visa allt" is fit, not real size', () => {
    expect(fitView()).toEqual({ zoom: 'fit', realSize: false });
  });

  it('"Verklig storlek" toggles real size and keeps the zoom', () => {
    expect(toggleRealSize({ zoom: 12, realSize: false })).toEqual({ zoom: 12, realSize: true });
    expect(toggleRealSize({ zoom: 'fit', realSize: true })).toEqual({
      zoom: 'fit',
      realSize: false,
    });
  });
});

describe('displayScale', () => {
  it('is the real-size scale, the fit scale or the zoom', () => {
    expect(displayScale({ zoom: 30, realSize: true }, 8)).toBe(PX_PER_MM);
    expect(displayScale({ zoom: 'fit', realSize: false }, 8)).toBe(8);
    expect(displayScale({ zoom: 30, realSize: false }, 8)).toBe(30);
  });
});

describe('fitScale', () => {
  it('fits the scene inside the viewport minus padding, at least 1 px/mm', () => {
    const pad = { top: 40, right: 150, bottom: 60, left: 50 };
    expect(fitScale({ width: 1200, height: 600 }, { width: 50, height: 25 }, pad)).toBe(20);
    expect(fitScale({ width: 1200, height: 2100 }, { width: 50, height: 25 }, pad)).toBe(20);
    expect(fitScale({ width: 100, height: 100 }, { width: 50, height: 25 }, pad)).toBe(1);
  });
});

describe('canvasPadding', () => {
  const box = { width: 1032, height: 840 };
  const pill = VIEW_PAD.left;

  it('is the base padding without a tool card', () => {
    expect(canvasPadding(box, { width: 30, height: 40 }, null)).toEqual(VIEW_PAD);
  });

  it('puts the sheet below a short tool card when that fits larger', () => {
    const card = { width: 196, height: 90 };
    const pad = canvasPadding(box, { width: 30, height: 40 }, card);
    expect(pad.left).toBe(pill);
    expect(pad.top).toBe(TOOL_CARD.top + card.height + TOOL_CARD.gap);
  });

  it('puts the sheet and pill beside a tall tool card when that fits larger', () => {
    const card = { width: 280, height: 400 };
    const pad = canvasPadding(box, { width: 20, height: 60 }, card);
    expect(pad.top).toBe(VIEW_PAD.top);
    expect(pad.left).toBe(TOOL_CARD.left + card.width + TOOL_CARD.gap + pill);
  });

  it('never lets the card overlap the sheet or the pill zone left of it', () => {
    for (const card of [
      { width: 196, height: 90 },
      { width: 280, height: 400 },
    ])
      for (const scene of [
        { width: 20, height: 60 },
        { width: 60, height: 20 },
        { width: 30, height: 40 },
      ]) {
        const pad = canvasPadding(box, scene, card);
        const below = pad.top >= TOOL_CARD.top + card.height + TOOL_CARD.gap;
        const beside = pad.left - pill >= TOOL_CARD.left + card.width + TOOL_CARD.gap;
        expect(below || beside).toBe(true);
      }
  });
});

describe('wheelZoom', () => {
  it('wheel up zooms in, down zooms out, from the displayed scale, real size off', () => {
    const v = { zoom: 'fit' as const, realSize: true };
    const zin = wheelZoom(v, 8, -100);
    expect(zin.realSize).toBe(false);
    expect(zin.zoom).toBeGreaterThan(96 / 25.4);
    expect(wheelZoom({ zoom: 10, realSize: false }, 8, 100).zoom).toBeLessThan(10);
    expect(wheelZoom({ zoom: 10, realSize: false }, 8, 0).zoom).toBe(10);
  });

  it('clamps to 1–80 px/mm', () => {
    expect(wheelZoom({ zoom: 79, realSize: false }, 8, -10000).zoom).toBe(80);
    expect(wheelZoom({ zoom: 1.5, realSize: false }, 8, 10000).zoom).toBe(1);
  });
});

describe('canvasPadding base', () => {
  it('returns the layout base padding without a tool card', () => {
    const base = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(canvasPadding({ width: 800, height: 600 }, { width: 20, height: 30 }, null, base)).toBe(
      base,
    );
  });
});

describe('startRowMm', () => {
  it('is the vertical centre of the start row in scene mm, or null without one', () => {
    const scene = { origin: { x: 4, y: 3 } };
    expect(startRowMm(scene, 2, 1.3)).toBeCloseTo(3 + 2.5 * 1.3);
    expect(startRowMm(scene, 0, 1.15)).toBeCloseTo(3 + 0.5 * 1.15);
    expect(startRowMm(scene, null, 1.3)).toBeNull();
  });
});
