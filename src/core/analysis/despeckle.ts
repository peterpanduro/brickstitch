import type { IndexGrid } from './rasterise';

const at = (g: IndexGrid, r: number, h: number): number => {
  if (r < 0 || r >= g.length || (h - r) % 2 !== 0) return -1;
  return g[r]![(h - (r & 1)) / 2] ?? -1;
};

/**
 * Despeckle (SPEC §5.4): a non-detail bead whose colour occurs in none of its filled lattice
 * neighbours takes the neighbours' majority colour (ties: lower index). Beads without filled
 * neighbours are kept. Reads the input grid only, so the result is order-independent.
 * @param locked cells (same shape as `cells`) that keep their colour (R37 ring cells)
 */
export function despeckle(
  cells: IndexGrid,
  detail: readonly boolean[],
  locked?: readonly (readonly boolean[])[],
): IndexGrid {
  return cells.map((row, r) =>
    row.map((c, i) => {
      if (c < 0 || detail[c] || locked?.[r]?.[i]) return c;
      const h = 2 * i + (r & 1);
      const nb = [
        at(cells, r, h - 2),
        at(cells, r, h + 2),
        at(cells, r - 1, h - 1),
        at(cells, r - 1, h + 1),
        at(cells, r + 1, h - 1),
        at(cells, r + 1, h + 1),
      ].filter((x) => x >= 0);
      if (nb.length === 0 || nb.includes(c)) return c;
      const n = new Map<number, number>();
      for (const x of nb) n.set(x, (n.get(x) ?? 0) + 1);
      return [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    }),
  );
}
