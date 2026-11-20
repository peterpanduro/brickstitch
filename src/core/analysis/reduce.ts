import { nearestIndex } from '../palette/deltaE';
import type { Lab, PaletteEntry } from '../palette/types';

/** Result of {@link reducePalette}. */
export interface Reduction {
  /** Kept palette indices, ascending. */
  readonly kept: readonly number[];
  /** Palette index -> kept palette index, or -1 when the colour never occurred. */
  readonly map: readonly number[];
}

/** Options for {@link reducePalette}. */
export interface ReduceOptions {
  readonly maxColors: number;
  /** Palette indices that are always kept and count towards `maxColors` (panel background). */
  readonly pinned?: readonly number[];
}

const DROP = 0.005;
const DROP_DETAIL = 0.001;

/**
 * Palette reduction (SPEC §5.4): drop colours under 0.5 % (detail under 0.1 %), then merge the
 * least-used non-detail colour (ties: later index) into its nearest kept colour (ΔE2000, ties:
 * earlier index) until at most `maxColors` remain; detail colours only after that. Deterministic.
 * @param hist pixel count per palette index
 * @param labs precomputed Lab per palette entry
 */
export function reducePalette(
  hist: readonly number[],
  palette: readonly PaletteEntry[],
  labs: readonly Lab[],
  { maxColors, pinned = [] }: ReduceOptions,
): Reduction {
  const total = hist.reduce((a, b) => a + b, 0);
  const count = [...hist];
  const isPinned = (i: number): boolean => pinned.includes(i);
  const keep = new Set<number>(pinned);
  hist.forEach((n, i) => {
    const min = palette[i]?.detail ? DROP_DETAIL : DROP;
    if (n > 0 && n >= min * total) keep.add(i);
  });
  if (keep.size === 0) hist.forEach((n, i) => n > 0 && keep.add(i));
  const map = hist.map((n, i) => (keep.has(i) ? i : n > 0 ? -2 : -1));

  const nearestKept = (i: number): number => {
    const idx = [...keep].filter((k) => k !== i).sort((a, b) => a - b);
    return idx[
      nearestIndex(
        labs[i]!,
        idx.map((k) => labs[k]!),
      )
    ]!;
  };
  const mergeInto = (i: number, into: number): void => {
    count[into] = count[into]! + count[i]!;
    for (let j = 0; j < map.length; j++) if (map[j] === i) map[j] = into;
  };
  map.forEach((m, i) => {
    if (m === -2) {
      const into = nearestKept(i);
      map[i] = into;
      count[into] = count[into]! + count[i]!;
    }
  });

  const victim = (detail: boolean): number | undefined =>
    [...keep]
      .filter((i) => !isPinned(i) && !!palette[i]?.detail === detail)
      .sort((a, b) => count[a]! - count[b]! || b - a)[0];
  while (keep.size > Math.max(1, maxColors)) {
    const i = victim(false) ?? victim(true);
    if (i === undefined) break;
    keep.delete(i);
    mergeInto(i, nearestKept(i));
  }
  return { kept: [...keep].sort((a, b) => a - b), map };
}
