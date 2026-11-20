import {
  analyse,
  floodFill,
  getCell,
  prune,
  resolveLadder,
  setCell,
  type ColorId,
  type Coord,
  type Pattern,
} from '../../core';
import { initHistory, push, record, redo, replacePresent, undo, type History } from './history';

/** Editing tools (SPEC §10, R36); `erase` empties cells and exists in shaped mode only. */
export type Tool = 'paint' | 'erase' | 'eyedropper' | 'fill' | 'ring';

/** An in-progress drag: the pattern before it and the ladder row pinned for it (R12). */
export interface Stroke {
  readonly before: Pattern;
  readonly ladderRow: number | null;
}

/** Pure editor state; the Svelte store wraps it. */
export interface EditorState {
  readonly history: History<Pattern>;
  readonly tool: Tool;
  readonly color: ColorId | null;
  readonly stroke: Stroke | null;
}

/** The pattern being edited. */
export const current = (s: EditorState): Pattern => s.history.present;

const validColor = (p: Pattern, c: ColorId | null): ColorId | null =>
  c !== null && p.palette.some((e) => e.id === c) ? c : (p.palette[0]?.id ?? null);

const withPattern = (s: EditorState, history: History<Pattern>): EditorState =>
  history === s.history
    ? s
    : {
        ...s,
        history,
        color: validColor(history.present, s.color),
        tool: validTool(history.present, s.tool),
      };

const validTool = (p: Pattern, t: Tool): Tool =>
  t === 'erase' && p.mode !== 'shaped' ? 'paint' : t;

/** Fresh editor on `p` with the paint tool and the first palette colour. */
export const createEditor = (p: Pattern): EditorState => ({
  history: initHistory(p),
  tool: 'paint',
  color: validColor(p, null),
  stroke: null,
});

/** Selects a tool; `erase` falls back to `paint` on panels. */
export const setTool = (s: EditorState, tool: Tool): EditorState => ({
  ...s,
  tool: validTool(current(s), tool),
});

/** Selects the `n`-th (1-based) palette colour; unchanged if there is none. */
export function selectColorIndex(s: EditorState, n: number): EditorState {
  const e = current(s).palette[n - 1];
  return e ? { ...s, color: e.id } : s;
}

/** Applies `edit` to the pattern as one undo step (ignored during a stroke). */
export const applyEdit = (s: EditorState, edit: (p: Pattern) => Pattern): EditorState =>
  s.stroke ? s : withPattern(s, push(s.history, edit(current(s))));

/** Undo, ignored during a stroke. */
export const undoEdit = (s: EditorState): EditorState =>
  s.stroke ? s : withPattern(s, undo(s.history));

/** Redo, ignored during a stroke. */
export const redoEdit = (s: EditorState): EditorState =>
  s.stroke ? s : withPattern(s, redo(s.history));

const strokeValue = (s: EditorState): ColorId | null | undefined =>
  s.tool === 'erase' ? null : s.tool === 'paint' && s.color !== null ? s.color : undefined;

/**
 * Starts a tool action at `c`: eyedropper picks the colour (then back to paint), fill floods
 * as one step, paint/erase start a stroke with the current ladder pinned.
 */
export function pointerDown(s: EditorState, c: Coord): EditorState {
  if (s.stroke) return s;
  const p = current(s);
  if (s.tool === 'eyedropper') {
    const v = getCell(p, c);
    return typeof v === 'string' ? { ...s, color: v, tool: 'paint' } : s;
  }
  if (s.tool === 'fill')
    return s.color === null ? s : applyEdit(s, (q) => floodFill(q, c, s.color));
  const v = strokeValue(s);
  if (v === undefined) return s;
  const stroke = { before: p, ladderRow: resolveLadder(p).row };
  return { ...s, stroke, history: replacePresent(s.history, setCell(p, c, v)) };
}

/** Continues a stroke at `c`; no-op without one. */
export function pointerMove(s: EditorState, c: Coord): EditorState {
  const v = strokeValue(s);
  if (!s.stroke || v === undefined) return s;
  const history = replacePresent(s.history, setCell(current(s), c, v));
  return history === s.history ? s : { ...s, history };
}

/** Ends a stroke, recording it as one undo step if anything changed. */
export const pointerUp = (s: EditorState): EditorState =>
  s.stroke ? { ...s, stroke: null, history: record(s.history, s.stroke.before) } : s;

/** Aborts a stroke: the pattern returns to `stroke.before` and no undo step is added (R51). */
export const cancelStroke = (s: EditorState): EditorState =>
  s.stroke ? { ...s, stroke: null, history: replacePresent(s.history, s.stroke.before) } : s;

/** Ladder row pinned by the active stroke, for `analyse(p, row)`; else `undefined`. */
export const pinnedLadder = (s: EditorState): number | undefined =>
  s.stroke?.ladderRow ?? undefined;

/** Fixes the ladder to 0-based row `r`. */
export const setManualLadder = (p: Pattern, r: number): Pattern => ({
  ...p,
  ladder: { kind: 'manual', row: r },
});

/** Returns the ladder to automatic selection. */
export const autoLadder = (p: Pattern): Pattern => ({ ...p, ladder: { kind: 'auto' } });

/** Removes floating beads for the resolved ladder (shaped only, SPEC R1); else `p`. */
export function removeUnsupported(p: Pattern): Pattern {
  if (p.mode !== 'shaped') return p;
  const a = analyse(p);
  const any = a.warnings.some((w) => w.code === 'floating');
  return a.ladderRow === null || !any ? p : prune(p, a.ladderRow);
}
