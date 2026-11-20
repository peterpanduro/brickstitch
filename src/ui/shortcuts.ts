/** The parts of a `KeyboardEvent` {@link shortcut} reads. */
export interface KeyLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly target:
    { readonly tagName?: string; readonly isContentEditable?: boolean } | EventTarget | null;
}

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Editor action for a key press: undo, redo, or a 1-based palette index; `null` otherwise. */
export function shortcut(e: KeyLike): 'undo' | 'redo' | number | null {
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target?.isContentEditable || (target?.tagName && FIELDS.has(target.tagName))) return null;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (mod && key === 'y') return 'redo';
  if (!mod && !e.altKey && /^[1-9]$/.test(e.key)) return Number(e.key);
  return null;
}

/** Undo/redo key hints for the platform (`mac`: ⌘ glyphs, else Ctrl). */
export const shortcutHints = (mac: boolean): { undo: string; redo: string } =>
  mac ? { undo: '⌘Z', redo: '⇧⌘Z' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Y' };
