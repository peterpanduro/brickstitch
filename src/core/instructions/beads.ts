import { colourCounts } from '../pattern/ops';
import type { Pattern } from '../pattern/types';
import type { BeadCountRow } from './types';

/** Bead counts per palette colour in palette order, zero counts omitted; pair = ×2. */
export function beadTable(p: Pattern): {
  rows: BeadCountRow[];
  total: number;
  totalPair: number;
} {
  const counts = colourCounts(p);
  const rows = p.palette
    .map((color) => ({ color, n: counts.get(color.id) ?? 0 }))
    .filter((x) => x.n > 0)
    .map(({ color, n }) => ({ color, perEarring: n, perPair: 2 * n }));
  const total = rows.reduce((s, x) => s + x.perEarring, 0);
  return { rows, total, totalPair: 2 * total };
}
