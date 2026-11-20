import type { Autosave, Pattern } from '../../core';

/**
 * Autosave state for the save pill (SPEC R50): `saved` nothing pending, `pending` debounce
 * running, `error` last write failed, `blocked` stored data could not be read.
 */
export type SaveStatus = 'saved' | 'pending' | 'error' | 'blocked';

/** Injected effects of {@link createAutosaveController}. */
export interface AutosaveDeps {
  readonly autosave: Autosave;
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (id: unknown) => void;
  /** Called with the error message when a write fails (e.g. quota). */
  readonly onError: (message: string) => void;
  /** Called after each successful write. */
  readonly onSaved?: () => void;
  /** Called once per {@link SaveStatus} change. */
  readonly onStatus?: (status: SaveStatus) => void;
}

/** Debounced autosave that refuses to overwrite stored data it could not read. */
export interface AutosaveController {
  /** Loads the stored pattern; on a parse/storage error blocks writes and returns it. */
  restore(): { pattern?: Pattern; error?: string };
  /** Saves `p` after the debounce delay, replacing any pending save. */
  schedule(p: Pattern): void;
  /** Writes a pending save now (e.g. on `visibilitychange`). */
  flush(): void;
  /** `true` while stored data failed to load and must not be overwritten. */
  readonly blocked: boolean;
  /** Current {@link SaveStatus}. */
  readonly status: SaveStatus;
  /** Allows writes again (new pattern started or the user confirmed). */
  unblock(): void;
}

/** Creates an {@link AutosaveController}; `delayMs` defaults to 500 (SPEC §9). */
export function createAutosaveController(d: AutosaveDeps, delayMs = 500): AutosaveController {
  let pending: Pattern | null = null;
  let timer: unknown = null;
  let blocked = false;
  let status: SaveStatus = 'saved';
  const set = (s: SaveStatus): void => {
    if (s === status) return;
    status = s;
    d.onStatus?.(s);
  };
  const flush = (): void => {
    if (timer !== null) d.clearTimer(timer);
    timer = null;
    if (pending === null || blocked) return;
    const r = d.autosave.save(pending);
    pending = null;
    set(r.ok ? 'saved' : 'error');
    if (r.ok) d.onSaved?.();
    else d.onError(r.error);
  };
  return {
    restore() {
      const r = d.autosave.load();
      if (r === null) return {};
      if (r.ok) return { pattern: r.pattern };
      blocked = true;
      set('blocked');
      return { error: r.error };
    },
    schedule(p) {
      pending = p;
      if (timer !== null) d.clearTimer(timer);
      timer = d.setTimer(flush, delayMs);
      if (!blocked) set('pending');
    },
    flush,
    get blocked() {
      return blocked;
    },
    get status() {
      return status;
    },
    unblock() {
      blocked = false;
      set(pending === null ? 'saved' : 'pending');
    },
  };
}

/** Save pill content for a {@link SaveStatus} (SPEC R50). */
export interface SavePill {
  readonly key: 'shell.saved' | 'shell.saving' | 'shell.notSaved';
  readonly tone: 'ok' | 'neutral' | 'danger';
  readonly icon: 'check' | 'alert' | null;
}

/** "Sparat" (ok, check), "Sparar…" (neutral) or "Inte sparat" (danger, alert). */
export function savePill(s: SaveStatus): SavePill {
  if (s === 'saved') return { key: 'shell.saved', tone: 'ok', icon: 'check' };
  if (s === 'pending') return { key: 'shell.saving', tone: 'neutral', icon: null };
  return { key: 'shell.notSaved', tone: 'danger', icon: 'alert' };
}
