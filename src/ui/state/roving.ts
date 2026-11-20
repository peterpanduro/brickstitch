/**
 * Next focusable row for roving tabindex over rows whose number is non-null: ArrowUp/ArrowDown
 * step, Home/End jump. `null` for other keys.
 */
export function rovingTarget(
  numbers: readonly (number | null)[],
  current: number,
  key: string,
): number | null {
  const rows = numbers.flatMap((n, r) => (n === null ? [] : [r]));
  const at = rows.indexOf(current);
  const pick = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))] ?? null;
  switch (key) {
    case 'ArrowDown':
      return pick(at + 1);
    case 'ArrowUp':
      return pick(at < 0 ? 0 : at - 1);
    case 'Home':
      return pick(0);
    case 'End':
      return pick(rows.length - 1);
    default:
      return null;
  }
}

/**
 * Next index in a list of `len` items for roving focus in menus and radio groups: arrows step
 * and wrap (Down/Right forward, Up/Left back), Home/End jump; `null` for other keys or no items.
 */
export function cycleIndex(len: number, current: number, key: string): number | null {
  if (len === 0) return null;
  const wrap = (i: number) => ((i % len) + len) % len;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return wrap(current + 1);
    case 'ArrowUp':
    case 'ArrowLeft':
      return current < 0 ? len - 1 : wrap(current - 1);
    case 'Home':
      return 0;
    case 'End':
      return len - 1;
    default:
      return null;
  }
}
