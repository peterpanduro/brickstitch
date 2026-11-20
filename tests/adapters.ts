import { hOf, iOf, rowLength, type Coord } from '../src/core/geometry';
import type { ColorId, Pattern, PaletteEntry, PatternMode } from '../src/core';

const entry = (id: string, db: string, hex: string): PaletteEntry => ({
  id,
  db,
  hex,
  approximate: true,
});

const COLORS: Record<string, PaletteEntry> = {
  R: entry('R', 'DB-723', '#D7262B'),
  B: entry('B', 'DB-726', '#0035AD'),
  Y: entry('Y', 'DB-721', '#FFCE00'),
  W: entry('W', 'DB-200', '#F7F7F5'),
  K: entry('K', 'DB-010', '#1C1C1C'),
  G: entry('G', 'DB-724', '#007229'),
};

const GHOST_GREY = entry('G', 'DB-1139', '#A3A8AE');

function build(
  title: string,
  mode: PatternMode,
  width: number,
  cells: (ColorId | null)[][],
  grey: boolean,
): Pattern {
  const used = new Set(cells.flat());
  const palette = Object.values(COLORS)
    .map((e) => (grey && e.id === 'G' ? GHOST_GREY : e))
    .filter((e) => used.has(e.id));
  return {
    title,
    description: '',
    beadType: 'delica11',
    mode,
    width,
    height: cells.length,
    palette,
    cells,
    ladder: { kind: 'auto' },
  };
}

/**
 * Test-only: `rows.json` convention (odd rows hold n-1 beads, offset +1/2), which is the
 * canonical lattice. Colour letters become palette ids; `G` is green.
 */
export function fromRowsJson(rows: readonly (readonly string[])[]): Pattern {
  const width = rows[0]?.length ?? 0;
  rows.forEach((row, r) => {
    if (row.length !== rowLength(width, r)) throw new Error(`row ${r}: bad length ${row.length}`);
  });
  return build(
    'rows',
    'panel',
    width,
    rows.map((row) => [...row]),
    false,
  );
}

/**
 * Test-only: sparse `"r,h"` dictionary (SPEC R4). `r' = r - rmin`; `h' = h - a` with
 * `a = hmin` if `hmin` and `rmin` share parity, else `hmin - 1`. `G` is ghost grey.
 */
export function fromRhJson(data: Readonly<Record<string, string>>): Pattern {
  const beads = Object.entries(data).map(([k, v]) => {
    const [r, h] = k.split(',').map(Number) as [number, number];
    return { r, h, v };
  });
  const rmin = Math.min(...beads.map((b) => b.r));
  const hmin = Math.min(...beads.map((b) => b.h));
  const a = (((hmin - rmin) % 2) + 2) % 2 === 0 ? hmin : hmin - 1;
  const hmax = Math.max(...beads.map((b) => b.h - a));
  const width = Math.floor(hmax / 2) + 1 + (hmax % 2);
  const height = Math.max(...beads.map((b) => b.r)) - rmin + 1;
  const cells = Array.from({ length: height }, (_, r) =>
    Array<ColorId | null>(rowLength(width, r)).fill(null),
  );
  for (const b of beads) {
    const r = b.r - rmin;
    (cells[r] as (ColorId | null)[])[iOf(r, b.h - a)] = b.v;
  }
  return build('rh', 'shaped', width, cells, true);
}

/** Ring beads = cells whose colour differs from the row's majority colour, rows r0..r1. */
export function ringOf(p: Pattern, r0: number, r1: number): Coord[] {
  const out: Coord[] = [];
  for (let r = r0; r <= r1; r++) {
    const row = p.cells[r] ?? [];
    const counts = new Map<string | null, number>();
    row.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    const major = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    row.forEach((c, i) => {
      if (c !== major) out.push({ r, h: hOf(r, i) });
    });
  }
  return out;
}
