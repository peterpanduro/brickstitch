import type { Analysis } from '../analyse';
import { hOf } from '../geometry';
import { rowInfo, rowNumbers } from '../pattern/rows';
import type { Pattern } from '../pattern/types';
import { beadRect, sceneLayout, type SceneLayout } from './layout';
import { beadMarks, markKey } from './marks';
import { SCENE_STYLE } from './style';
import type { BeadMark, Scene, SceneOptions, SceneRow, Shape, ShapeRole } from './types';

type Text = Extract<Shape, { t: 'text' }>;

const rowText = (
  l: SceneLayout,
  r: number,
  x: number,
  text: string,
  role: ShapeRole,
  anchor: Text['anchor'],
  fill: string = SCENE_STYLE.text,
): Text => ({
  t: 'text',
  x,
  y: l.origin.y + (r + 0.5) * l.t.rowPitchMm + l.textSize * 0.35,
  text,
  size: l.textSize,
  anchor,
  role,
  r,
  fill,
});

const rowMarks = (marks: ReadonlyMap<number, BeadMark>, r: number, len: number): string => {
  let out = '';
  for (let i = 0; i < len; i++) {
    const m = marks.get(markKey(r, hOf(r, i)));
    if (m) out += `${i}${m[0]}`;
  }
  return out;
};

function rowShapes(
  p: Pattern,
  r: number,
  l: SceneLayout,
  o: SceneOptions,
  fills: ReadonlyMap<string, string>,
  marks: ReadonlyMap<number, BeadMark>,
): Shape[] {
  return (p.cells[r] ?? []).flatMap((c, i): Shape[] => {
    const h = hOf(r, i);
    const rect = beadRect(l, r, h);
    if (c === null) return o.slots ? [{ t: 'slot', r, h, ...rect }] : [];
    const fill = fills.get(c) ?? SCENE_STYLE.unknownFill;
    const mark = marks.get(markKey(r, h));
    return [{ t: 'bead', r, h, ...rect, fill, ...(mark && { mark }) }];
  });
}

function sceneRows(
  p: Pattern,
  a: Analysis,
  l: SceneLayout,
  o: SceneOptions,
  reuse: Scene | undefined,
): SceneRow[] {
  const fills = new Map(p.palette.map((e) => [e.id, e.hex]));
  const marks: ReadonlyMap<number, BeadMark> = o.warnings ? beadMarks(p, a) : new Map();
  return p.cells.map((cells, r) => {
    const sig = rowMarks(marks, r, cells.length);
    const old = reuse?.rows[r];
    if (old && old.cells === cells && old.marks === sig) return old;
    return { r, cells, marks: sig, shapes: rowShapes(p, r, l, o, fills, marks) };
  });
}

function ladderTint(a: Analysis, l: SceneLayout, o: SceneOptions): Shape[] {
  if (!o.ladder || a.ladderRow === null) return [];
  const y = l.origin.y + a.ladderRow * l.t.rowPitchMm;
  const fill = SCENE_STYLE.ladderTint;
  return [{ t: 'rect', x: 0, y, w: l.width, h: l.t.rowPitchMm, fill, role: 'ladder' }];
}

function ladderLabel(a: Analysis, l: SceneLayout, o: SceneOptions): Shape[] {
  if (!o.ladder || a.ladderRow === null) return [];
  const label = o.ladderLabel ?? 'L';
  return [rowText(l, a.ladderRow, l.pad, label, 'ladder', 'start', SCENE_STYLE.ladderText)];
}

function gutterTexts(p: Pattern, a: Analysis, l: SceneLayout, o: SceneOptions): Shape[] {
  const numbers = rowNumbers(p);
  const alertRows = new Set(
    a.warnings
      .filter((w) => w.code === 'floating' || w.code === 'needsExtraLadder')
      .map((w) => w.r),
  );
  const right = l.origin.x + l.latticeWidth + l.pad;
  const warnX = right + (o.counts ? l.textSize * 2 : 0);
  return p.cells.flatMap((_, r): Shape[] => {
    const n = numbers[r];
    if (n === null || n === undefined) return [];
    const info = rowInfo(p, r);
    const out: Shape[] = [];
    if (o.rowNumbers) out.push(rowText(l, r, l.gutterLeft - l.pad, String(n), 'rowNumber', 'end'));
    if (o.counts) out.push(rowText(l, r, right, String(info.count), 'count', 'start'));
    const y = l.origin.y + (r + 0.5) * l.t.rowPitchMm;
    const size = l.textSize;
    if (o.warnings && alertRows.has(r)) {
      out.push({ t: 'marker', kind: 'alert', x: warnX, y, size, r });
    }
    if (o.warnings && info.segments.length > 1) {
      const x = warnX + size * 1.3;
      out.push({ t: 'marker', kind: 'segments', x, y, size, r, value: info.segments.length });
    }
    return out;
  });
}

function loopShapes(a: Analysis, l: SceneLayout, o: SceneOptions): Shape[] {
  const loop = a.instructions?.loop;
  if (!o.loop || !loop) return [];
  const { widthMm: bw, rowPitchMm: bh } = l.t;
  return [
    {
      t: 'circle',
      cx: l.origin.x + (loop.h * bw) / 2 + bw / 2,
      cy: l.origin.y + loop.r * bh - bh * 0.4,
      r: bh * 0.32,
      stroke: SCENE_STYLE.loop,
      role: 'loop',
    },
  ];
}

/** `prev` when it has the same content as `next`, so renderers can skip it. */
const keep = (prev: readonly Shape[] | undefined, next: Shape[]): readonly Shape[] =>
  prev && prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)
    ? prev
    : next;

/**
 * Renderer-independent diagram of `p` (SPEC §3.5, §7): ladder tint and label, beads (with
 * feasibility marks), empty-cell slots, row numbers (R6), counts and markers in the gutters,
 * loop marker. Uses the ladder, status and warnings of `analysis`, which must be for `p`.
 * Rows of `reuse` (a previous scene) are kept by reference when their cells, marks, palette
 * and layout are unchanged; background and overlay when their content is equal.
 */
export function diagramScene(
  p: Pattern,
  analysis: Analysis,
  opts: SceneOptions,
  reuse?: Scene,
): Scene {
  const l = sceneLayout(p, opts);
  const layoutKey = `${p.beadType}|${l.origin.x}|${l.origin.y}|${opts.slots ? 1 : 0}|${opts.warnings ? 1 : 0}`;
  const same = reuse?.layoutKey === layoutKey && reuse.palette === p.palette;
  return {
    widthMm: l.width,
    heightMm: l.height,
    origin: l.origin,
    gutterLeftMm: l.gutterLeft,
    layoutKey,
    palette: p.palette,
    background: keep(reuse?.background, ladderTint(analysis, l, opts)),
    rows: sceneRows(p, analysis, l, opts, same ? reuse : undefined),
    overlay: keep(reuse?.overlay, [
      ...ladderLabel(analysis, l, opts),
      ...gutterTexts(p, analysis, l, opts),
      ...loopShapes(analysis, l, opts),
    ]),
  };
}
