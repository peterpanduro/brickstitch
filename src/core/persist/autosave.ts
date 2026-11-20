import type { Pattern } from '../pattern/types';
import { parsePatternFile, serialise, type ParseResult } from './pattern-file';
import type { KeyValueStore } from './types';

/** Result of {@link Autosave.load}: a parse result, or `storage` when the store threw. */
export type LoadResult = ParseResult | { ok: false; error: 'storage' };

/**
 * Autosave handle; neither operation throws. `load` returns `null` only when nothing is
 * stored, so corrupt data can be reported instead of silently discarded.
 */
export interface Autosave {
  save(p: Pattern): { ok: true } | { ok: false; error: string };
  load(): LoadResult | null;
}

/** Creates an autosave over `store` under `key` (no timers: debounce in the caller). */
export function createAutosave(
  store: KeyValueStore,
  key: string,
  appVersion = 'autosave',
): Autosave {
  return {
    save(p) {
      try {
        store.set(key, serialise(p, appVersion, new Date()));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    load() {
      let raw: string | null;
      try {
        raw = store.get(key);
      } catch {
        return { ok: false, error: 'storage' };
      }
      return raw === null ? null : parsePatternFile(raw);
    },
  };
}
