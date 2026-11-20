import { iOf, neighbours, rowLength, type BeadTypeId, type Coord } from '../geometry';
import type { ColorId, PaletteEntry } from '../palette/types';
import type { LadderChoice, Pattern, PatternMode } from './types';

export * from './palette-ops';

type Cell = ColorId | null;

/** Options for {@link createPattern}. */
export interface NewPatternOptions {
  readonly title?: string;
  readonly beadType: BeadTypeId;
  readonly mode: PatternMode;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly PaletteEntry[];
  /** Panel fill colour (required for panels); shaped patterns start empty. */
  readonly fill?: ColorId | null;
}

/** Creates a blank pattern; throws on out-of-range size or a missing/unknown panel fill. */
export function createPattern(o: NewPatternOptions): Pattern {
  if (!Number.isInteger(o.width) || o.width < 2 || o.width > 80) {
    throw new Error('width must be 2..80');
  }
  if (!Number.isInteger(o.height) || o.height < 1 || o.height > 120) {
    throw new Error('height must be 1..120');
  }
  const fill: Cell = o.mode === 'panel' ? (o.fill ?? null) : null;
  if (o.mode === 'panel' && (fill === null || !o.palette.some((e) => e.id === fill))) {
    throw new Error('panel needs a fill colour from the palette');
  }
  return {
    title: o.title ?? '',
    description: '',
    beadType: o.beadType,
    mode: o.mode,
    width: o.width,
    height: o.height,
    palette: o.palette,
    cells: Array.from({ length: o.height }, (_, r) =>
      Array<Cell>(rowLength(o.width, r)).fill(fill),
    ),
    ladder: { kind: 'auto' },
  };
}

const indexOf = (p: Pattern, { r, h }: Coord): number | null => {
  if (r < 0 || r >= p.height || (h - r) % 2 !== 0) return null;
  const i = iOf(r, h);
  return i >= 0 && i < rowLength(p.width, r) ? i : null;
};

/** Cell value at `c`, or `undefined` when `c` is off the lattice. */
export function getCell(p: Pattern, c: Coord): Cell | undefined {
  const i = indexOf(p, c);
  return i === null ? undefined : p.cells[c.r]?.[i];
}

/**
 * Sets many cells in one pass; returns `p` itself when nothing changes.
 * @throws if `color` is neither `null` nor a palette id.
 */
export function paintCells(p: Pattern, coords: readonly Coord[], color: Cell): Pattern {
  if (color !== null && !p.palette.some((e) => e.id === color)) {
    throw new Error(`unknown colour id ${color}`);
  }
  const rows = new Map<number, Cell[]>();
  for (const c of coords) {
    const i = indexOf(p, c);
    if (i === null || getCell(p, c) === color) continue;
    let row = rows.get(c.r);
    if (!row) rows.set(c.r, (row = [...(p.cells[c.r] as Cell[])]));
    row[i] = color;
  }
  if (rows.size === 0) return p;
  return { ...p, cells: p.cells.map((row, r) => rows.get(r) ?? row) };
}

/** Sets one cell; returns `p` itself when nothing changes or `c` is off-lattice. Throws like {@link paintCells}. */
export const setCell = (p: Pattern, c: Coord, color: Cell): Pattern => paintCells(p, [c], color);

/**
 * Replaces the connected same-value region around `start` (6-neighbourhood, nulls included).
 * Throws like {@link paintCells}.
 */
export function floodFill(p: Pattern, start: Coord, color: Cell): Pattern {
  const target = getCell(p, start);
  if (target === undefined || target === color) return paintCells(p, [], color);
  const key = (c: Coord) => `${c.r},${c.h}`;
  const seen = new Set([key(start)]);
  const region: Coord[] = [];
  for (const stack = [start]; stack.length;) {
    const c = stack.pop() as Coord;
    region.push(c);
    for (const n of neighbours(c)) {
      if (getCell(p, n) === target && !seen.has(key(n))) {
        seen.add(key(n));
        stack.push(n);
      }
    }
  }
  return paintCells(p, region, color);
}

/** Bead count per colour (empty cells excluded). */
export function colourCounts(p: Pattern): Map<ColorId, number> {
  const out = new Map<ColorId, number>();
  for (const row of p.cells) for (const c of row) if (c !== null) out.set(c, (out.get(c) ?? 0) + 1);
  return out;
}

/** Total number of beads. */
export const beadCount = (p: Pattern): number =>
  [...colourCounts(p).values()].reduce((a, b) => a + b, 0);

const leading = (xs: readonly Cell[]): number => {
  const i = xs.findIndex((c) => c !== null);
  return i < 0 ? xs.length : i;
};

/**
 * Trims empty margins. Top rows go in even numbers only so lattice parity is kept (SPEC R3, so
 * one empty top row may remain); the bottom is trimmed fully; columns go in whole beads, keeping
 * width >= 2. Returns `p` when there
 * is no content or nothing to trim. A manual ladder row is shifted with the rows.
 */
export function cropToContent(p: Pattern): Pattern {
  const used = p.cells.map((row) => row.some((c) => c !== null));
  const first = used.indexOf(true);
  if (first < 0) return p;
  const top = first & ~1;
  const bottom = p.height - 1 - used.lastIndexOf(true);
  const left = Math.min(...p.cells.map(leading), p.width - 2);
  const right = Math.min(...p.cells.map((row) => leading([...row].reverse())), p.width - 2 - left);
  if (top + bottom + left + right === 0) return p;
  const width = p.width - left - right;
  const cells = p.cells
    .slice(top, p.height - bottom)
    .map((row, r) => row.slice(left, left + rowLength(width, r)));
  const row = p.ladder.kind === 'manual' ? p.ladder.row - top : -1;
  const ladder: LadderChoice =
    p.ladder.kind === 'auto'
      ? p.ladder
      : row >= 0 && row < cells.length
        ? { kind: 'manual', row }
        : { kind: 'auto' };
  return { ...p, width, height: cells.length, cells, ladder };
}
