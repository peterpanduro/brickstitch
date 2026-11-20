import { clampScale } from './zoom';

/** Pointer device kind, as in `PointerEvent.pointerType`. */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/** A point in client (CSS) pixels. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** One pointer event fed to {@link gestureStep}. */
export interface GestureInput extends Pt {
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly id: number;
  readonly kind: PointerKind;
}

/**
 * What the canvas should do: run the tool (`down`/`move`/`end`, where `released` is a real
 * pointerup), abort it (`cancel`: stroke back to `stroke.before`, ring placement dropped), or
 * pan/zoom (`pinchStart` at `mid`; `pinch` to `scale` px/mm with the start point under `mid`;
 * `pinchEnd` when the view may be saved).
 */
export type GestureOutput =
  | ({ readonly kind: 'down' | 'move'; readonly id: number } & Pt)
  | { readonly kind: 'end'; readonly id: number; readonly released: boolean }
  | { readonly kind: 'cancel' | 'pinchEnd' }
  | { readonly kind: 'pinchStart'; readonly mid: Pt }
  | { readonly kind: 'pinch'; readonly scale: number; readonly mid: Pt };

interface Pinch {
  readonly a: number;
  readonly b: number;
  readonly dist: number;
  readonly scale: number;
}

/** Gesture recogniser state (SPEC R51). */
export interface GestureState {
  /** Touch pointers currently down. */
  readonly touches: Readonly<Record<number, Pt>>;
  /** Pointer driving the tool, if any, and its kind. */
  readonly tool: number | null;
  readonly toolKind: PointerKind | null;
  readonly pinch: Pinch | null;
}

/** Nothing pressed. */
export const initGesture = (): GestureState => ({
  touches: {},
  tool: null,
  toolKind: null,
  pinch: null,
});

const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y) || 1;

type Step = { state: GestureState; out: GestureOutput[] };

const none = (state: GestureState): Step => ({ state, out: [] });

function penDown(s: GestureState, e: GestureInput): Step {
  if (s.toolKind === 'pen' || s.toolKind === 'mouse') return none(s);
  const out: GestureOutput[] = [];
  if (s.tool !== null) out.push({ kind: 'cancel' });
  if (s.pinch) out.push({ kind: 'pinchEnd' });
  out.push({ kind: 'down', id: e.id, x: e.x, y: e.y });
  return { state: { ...s, tool: e.id, toolKind: 'pen', pinch: null }, out };
}

function device(s: GestureState, e: GestureInput): Step {
  if (e.type === 'down') {
    if (e.kind === 'pen') return penDown(s, e);
    if (s.tool !== null || Object.keys(s.touches).length > 0) return none(s);
    return {
      state: { ...s, tool: e.id, toolKind: e.kind },
      out: [{ kind: 'down', id: e.id, x: e.x, y: e.y }],
    };
  }
  if (e.id !== s.tool || e.kind !== s.toolKind) return none(s);
  if (e.type === 'move') return { state: s, out: [{ kind: 'move', id: e.id, x: e.x, y: e.y }] };
  return {
    state: { ...s, tool: null, toolKind: null },
    out: [{ kind: 'end', id: e.id, released: e.type === 'up' }],
  };
}

function touchDown(s: GestureState, e: GestureInput, scale: number): Step {
  if (s.toolKind === 'pen' || s.toolKind === 'mouse') return none(s);
  const touches = { ...s.touches, [e.id]: { x: e.x, y: e.y } };
  const ids = Object.keys(touches).map(Number);
  if (ids.length === 1) {
    return {
      state: { ...s, touches, tool: e.id, toolKind: 'touch' },
      out: [{ kind: 'down', id: e.id, x: e.x, y: e.y }],
    };
  }
  if (ids.length !== 2 || s.pinch) return none({ ...s, touches });
  const [a, b] = ids as [number, number];
  const pa = touches[a]!;
  const pb = touches[b]!;
  const out: GestureOutput[] = s.tool !== null ? [{ kind: 'cancel' }] : [];
  out.push({ kind: 'pinchStart', mid: mid(pa, pb) });
  const pinch = { a, b, dist: dist(pa, pb), scale };
  return { state: { touches, tool: null, toolKind: null, pinch }, out };
}

function touchMove(s: GestureState, e: GestureInput): Step {
  const touches = { ...s.touches, [e.id]: { x: e.x, y: e.y } };
  const next = { ...s, touches };
  if (s.tool === e.id && s.toolKind === 'touch')
    return { state: next, out: [{ kind: 'move', id: e.id, x: e.x, y: e.y }] };
  const p = s.pinch;
  if (!p || (e.id !== p.a && e.id !== p.b)) return none(next);
  const pa = touches[p.a]!;
  const pb = touches[p.b]!;
  const scale = clampScale((p.scale * dist(pa, pb)) / p.dist);
  return { state: next, out: [{ kind: 'pinch', scale, mid: mid(pa, pb) }] };
}

function touchUp(s: GestureState, e: GestureInput): Step {
  const touches = Object.fromEntries(Object.entries(s.touches).filter(([k]) => Number(k) !== e.id));
  const mine = s.tool === e.id && s.toolKind === 'touch';
  const ends = s.pinch !== null && (e.id === s.pinch.a || e.id === s.pinch.b);
  const out: GestureOutput[] = mine
    ? [{ kind: 'end', id: e.id, released: e.type === 'up' }]
    : ends
      ? [{ kind: 'pinchEnd' }]
      : [];
  const state = {
    touches,
    tool: mine ? null : s.tool,
    toolKind: mine ? null : s.toolKind,
    pinch: ends ? null : s.pinch,
  };
  return { state, out };
}

/**
 * Advances the recogniser by one pointer event. `scale` is the displayed px/mm, read when a
 * pinch starts. One touch drives the tool like a mouse; a second touch cancels it and pinches
 * (pan + zoom, clamped 1–80 px/mm); a new tool touch needs every finger up first. A pen takes
 * over from touches (cancelling their stroke or pinch) and touches are ignored while it is down;
 * a mouse press is ignored while anything else is down.
 */
export function gestureStep(s: GestureState, e: GestureInput, scale: number): Step {
  if (e.kind !== 'touch') return device(s, e);
  if (e.type === 'down') return touchDown(s, e, scale);
  if (!(e.id in s.touches)) return none(s);
  return e.type === 'move' ? touchMove(s, e) : touchUp(s, e);
}
