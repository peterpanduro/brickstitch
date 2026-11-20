import type { ColorId, Pattern } from '../src/core';

/** Builds a shaped pattern from strings; `.` is empty, any other char a colour id. */
export function shaped(rows: readonly string[]): Pattern {
  const width = Math.max(...rows.map((s, r) => s.length + (r & 1)));
  const cells = rows.map((s, r) => {
    const n = r % 2 === 0 ? width : width - 1;
    return Array.from({ length: n }, (_, i): ColorId | null => {
      const c = s[i];
      return c === undefined || c === '.' ? null : c;
    });
  });
  return {
    title: 't',
    description: '',
    beadType: 'delica11',
    mode: 'shaped',
    width,
    height: rows.length,
    palette: [],
    cells,
    ladder: { kind: 'auto' },
  };
}
