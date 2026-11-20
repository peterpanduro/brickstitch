import {
  BEAD_ROUNDING,
  EDITOR_BEAD_ROUNDING,
  MARK_STYLE,
  SCENE_STYLE,
  SLOT_SLASH_INSET,
} from './style';
import type { Shape } from './types';

/** One SVG element: tag, attributes and optional text content. */
export interface SvgElement {
  readonly tag: 'rect' | 'circle' | 'line' | 'text' | 'polygon' | 'polyline';
  readonly attrs: Readonly<Record<string, string | number>>;
  readonly text?: string;
}

/** Default id of the floating-bead hatch pattern. */
export const HATCH_ID = 'bs-hatch';

const n = (x: number): number => +x.toFixed(3);
const S = SCENE_STYLE.stroke;

const box = (x: number, y: number, w: number, h: number) => ({
  x: n(x),
  y: n(y),
  width: n(w),
  height: n(h),
  rx: n(Math.min(w, h) * BEAD_ROUNDING),
});

/**
 * Faint `/` through an empty cell, bottom-left to top-right inside the inset slot rect, so it
 * cannot be mistaken for a white bead. Shared by the SVG and PDF renderers.
 */
export function slotSlash(s: Extract<Shape, { t: 'slot' }>): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const ix = s.wMm * SLOT_SLASH_INSET;
  const iy = s.hMm * SLOT_SLASH_INSET;
  return { x1: s.xMm + ix, y1: s.yMm + s.hMm - iy, x2: s.xMm + s.wMm - ix, y2: s.yMm + iy };
}

/** Hatch pattern contents (one line, user units), for a `<pattern>` 0.5 mm square rotated 45°. */
export const HATCH_LINE: SvgElement = {
  tag: 'line',
  attrs: {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0.5,
    stroke: MARK_STYLE.floating.stroke,
    'stroke-width': S.hatch,
  },
};

/** Class of a shape's elements per kind, so the editor can restyle them with tokens (R45). */
function shapeClass(s: Shape): string | undefined {
  switch (s.t) {
    case 'bead':
      return 'bs-bead';
    case 'slot':
      return 'bs-slot';
    case 'text':
      return s.role === 'ladder' ? 'bs-text bs-ladder' : 'bs-text';
    case 'rect':
      return s.role === 'ladder' ? 'bs-ladder' : undefined;
    case 'circle':
      return s.role === 'loop' ? 'bs-loop' : undefined;
    case 'marker':
      return s.kind === 'segments' ? 'bs-marker' : undefined;
    default:
      return undefined;
  }
}

function marker(s: Extract<Shape, { t: 'marker' }>): SvgElement[] {
  const z = s.size;
  const { x, y } = s;
  if (s.kind === 'alert') {
    const pts = [
      [x + z / 2, y - z / 2],
      [x + z, y + z / 2],
      [x, y + z / 2],
    ];
    return [
      {
        tag: 'polygon',
        attrs: { points: pts.map((p) => p.map(n).join(',')).join(' '), fill: SCENE_STYLE.alert },
      },
      {
        tag: 'text',
        attrs: {
          x: n(x + z / 2),
          y: n(y + z * 0.42),
          'font-size': n(z * 0.75),
          'text-anchor': 'middle',
          fill: SCENE_STYLE.alertText,
          'font-weight': 'bold',
        },
        text: '!',
      },
    ];
  }
  const fork = [
    [x + z * 0.15, y - z / 2],
    [x + z * 0.4, y],
    [x + z * 0.65, y - z / 2],
  ];
  return [
    {
      tag: 'polyline',
      attrs: {
        points: fork.map((p) => p.map(n).join(',')).join(' '),
        fill: 'none',
        stroke: SCENE_STYLE.text,
        'stroke-width': S.marker,
      },
    },
    {
      tag: 'line',
      attrs: {
        x1: n(x + z * 0.4),
        y1: n(y),
        x2: n(x + z * 0.4),
        y2: n(y + z / 2),
        stroke: SCENE_STYLE.text,
        'stroke-width': S.marker,
      },
    },
    {
      tag: 'text',
      attrs: {
        x: n(x + z * 0.8),
        y: n(y + z * 0.35),
        'font-size': n(z),
        'text-anchor': 'start',
        fill: SCENE_STYLE.text,
      },
      text: String(s.value ?? ''),
    },
  ];
}

/**
 * SVG elements of one shape; the single source of per-shape attributes for both the string
 * renderer and the Svelte canvas. Each element carries the shape's class (R45, except mark
 * outlines). With `glossId` (editor only) beads and slots are rounded by
 * {@link EDITOR_BEAD_ROUNDING} of their height and beads get a gloss rect filled with the
 * gradient `glossId` under any mark.
 */
export function shapeElements(s: Shape, hatchId = HATCH_ID, glossId?: string): SvgElement[] {
  const cls = shapeClass(s);
  const els = elements(s, hatchId, glossId);
  return cls
    ? els.map((e) => (e.attrs['data-mark'] || e.attrs.class ? e : withClass(e, cls)))
    : els;
}

const withClass = (e: SvgElement, cls: string): SvgElement => ({
  ...e,
  attrs: { ...e.attrs, class: cls },
});

function elements(s: Shape, hatchId: string, glossId: string | undefined): SvgElement[] {
  switch (s.t) {
    case 'bead': {
      const shape = box(s.xMm, s.yMm, s.wMm, s.hMm);
      if (glossId) shape.rx = n(s.hMm * EDITOR_BEAD_ROUNDING);
      const base: SvgElement = {
        tag: 'rect',
        attrs: {
          ...shape,
          fill: s.fill,
          stroke: SCENE_STYLE.beadStroke,
          'stroke-width': S.bead,
          'data-bead': `${s.r},${s.h}`,
        },
      };
      const out: SvgElement[] = [base];
      if (glossId)
        out.push({
          tag: 'rect',
          attrs: {
            ...shape,
            fill: `url(#${glossId})`,
            'pointer-events': 'none',
            class: 'bs-gloss',
          },
        });
      if (!s.mark) return out;
      const m = MARK_STYLE[s.mark];
      const over: Record<string, string | number> = {
        ...shape,
        fill: m.hatch ? `url(#${hatchId})` : 'none',
        stroke: m.stroke,
        'stroke-width': S.mark,
        'data-mark': s.mark,
      };
      if (m.dash) over['stroke-dasharray'] = m.dash;
      return [...out, { tag: 'rect', attrs: over }];
    }
    case 'slot':
      return [
        {
          tag: 'rect',
          attrs: {
            ...box(s.xMm, s.yMm, s.wMm, s.hMm),
            ...(glossId && { rx: n(s.hMm * EDITOR_BEAD_ROUNDING) }),
            fill: 'none',
            stroke: SCENE_STYLE.slot,
            'stroke-width': S.slot,
            'data-slot': `${s.r},${s.h}`,
          },
        },
        {
          tag: 'line',
          attrs: {
            ...Object.fromEntries(Object.entries(slotSlash(s)).map(([k, v]) => [k, n(v)])),
            stroke: SCENE_STYLE.slotSlash,
            'stroke-width': S.slotSlash,
            'pointer-events': 'none',
          },
        },
      ];
    case 'rect':
      return [
        {
          tag: 'rect',
          attrs: { x: n(s.x), y: n(s.y), width: n(s.w), height: n(s.h), fill: s.fill },
        },
      ];
    case 'circle':
      return [
        {
          tag: 'circle',
          attrs: {
            cx: n(s.cx),
            cy: n(s.cy),
            r: n(s.r),
            stroke: s.stroke,
            'stroke-width': S.loop,
            fill: s.fill ?? 'none',
          },
        },
      ];
    case 'line':
      return [
        {
          tag: 'line',
          attrs: {
            x1: n(s.x1),
            y1: n(s.y1),
            x2: n(s.x2),
            y2: n(s.y2),
            stroke: s.stroke,
            'stroke-width': S.line,
          },
        },
      ];
    case 'marker':
      return marker(s);
    case 'text': {
      const attrs: Record<string, string | number> = {
        x: n(s.x),
        y: n(s.y),
        'font-size': n(s.size),
        'text-anchor': s.anchor,
        fill: s.fill ?? SCENE_STYLE.text,
      };
      if (s.role === 'ladder') attrs['font-weight'] = SCENE_STYLE.ladderFontWeight;
      return [{ tag: 'text', attrs, text: s.text }];
    }
  }
}
