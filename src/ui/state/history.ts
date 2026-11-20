/** Snapshot undo history of immutable values. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

/** Default undo depth (SPEC §7). */
export const HISTORY_DEPTH = 100;

/** History holding only `present`. */
export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/**
 * Records a step from `before` to the current present (e.g. at the end of a drag stroke);
 * unchanged when they are identical. Clears redo and keeps at most `depth` past entries.
 */
export function record<T>(h: History<T>, before: T, depth = HISTORY_DEPTH): History<T> {
  if (before === h.present) return h;
  return { past: [...h.past, before].slice(-depth), present: h.present, future: [] };
}

/** Makes `next` the present as one undo step; returns `h` when `next` is the present. */
export const push = <T>(h: History<T>, next: T, depth = HISTORY_DEPTH): History<T> =>
  record(replacePresent(h, next), h.present, depth);

/** Replaces the present without recording a step (used during a stroke). */
export const replacePresent = <T>(h: History<T>, next: T): History<T> =>
  next === h.present ? h : { ...h, present: next };

/** Steps back; returns `h` when there is nothing to undo. */
export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: prev as T, future: [h.present, ...h.future] };
}

/** Steps forward; returns `h` when there is nothing to redo. */
export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0] as T, future: h.future.slice(1) };
}

/** Whether {@link undo} would change anything. */
export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;

/** Whether {@link redo} would change anything. */
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;
