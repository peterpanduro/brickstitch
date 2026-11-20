import { hOf, type Coord } from '../geometry';
import type { ColorId, Pattern, RowInfo, RowSegment } from './types';

/** Summary of row `r`: maximal runs of adjacent beads, bead count and outer `h` extents. */
export function rowInfo(p: Pattern, r: number): RowInfo {
  const segments: RowSegment[] = [];
  let start = -1;
  let colors: ColorId[] = [];
  const row = p.cells[r] ?? [];
  const close = (end: number): void => {
    if (start >= 0) segments.push({ hStart: hOf(r, start), hEnd: hOf(r, end), colors });
    start = -1;
    colors = [];
  };
  row.forEach((c, i) => {
    if (c === null) return close(i - 1);
    if (start < 0) start = i;
    colors.push(c);
  });
  close(row.length - 1);
  const count = segments.reduce((n, s) => n + s.colors.length, 0);
  const first = segments[0];
  const last = segments[segments.length - 1];
  return first && last
    ? { r, segments, count, left: first.hStart, right: last.hEnd }
    : { r, segments, count };
}

/** Coordinates of every bead, row-major. */
export function beadCoords(p: Pattern): Coord[] {
  return p.cells.flatMap((row, r) =>
    row.flatMap((c, i) => (c === null ? [] : [{ r, h: hOf(r, i) }])),
  );
}

/** `rowInfo` for every row, top to bottom. */
export function allRows(p: Pattern): RowInfo[] {
  return p.cells.map((_, r) => rowInfo(p, r));
}

/** Display row numbers (SPEC R6): non-empty rows numbered 1… from the top; empty rows `null`. */
export function rowNumbers(p: Pattern): (number | null)[] {
  let n = 0;
  return p.cells.map((row) => (row.some((c) => c !== null) ? ++n : null));
}
