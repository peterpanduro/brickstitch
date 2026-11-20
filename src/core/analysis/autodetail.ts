import { deltaE2000 } from '../palette/deltaE';
import type { Lab } from '../palette/types';

const MIN_DISTANCE = 40;
const MAX_SHARE = 0.15;
const MIN_SHARE = 0.0005;
const COMPACT = 0.5;

/** Where a colour's pixels are solid: flat pixels (not edge blends) and the smallest area of a real mark. */
export interface DetailGuard {
  /** 1 for foreground pixels that are not anti-aliased edge blends. */
  readonly flat: Uint8Array;
  readonly width: number;
  /** Smallest connected area (px) that counts as a mark and not as a rim or noise. */
  readonly minArea: number;
  /** Smallest pixel count of a colour, as a bead area at the working scale. */
  readonly minPixels: number;
}

/** Share of each colour's flat pixels that lie in connected areas of at least `minArea` px. */
function compactness(labels: Int16Array, n: number, g: DetailGuard): number[] {
  const { flat, width, minArea } = g;
  const seen = new Uint8Array(labels.length);
  const stack: number[] = [];
  const solid = new Array<number>(n).fill(0);
  const all = new Array<number>(n).fill(0);
  for (let s = 0; s < labels.length; s++) {
    const k = labels[s]!;
    if (k < 0 || !flat[s] || seen[s]) continue;
    let area = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length > 0) {
      const p = stack.pop()!;
      area++;
      const x = p % width;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of next)
        if (q >= 0 && q < labels.length && !seen[q] && flat[q] && labels[q] === k) {
          seen[q] = 1;
          stack.push(q);
        }
    }
    all[k]! += area;
    if (area >= minArea) solid[k]! += area;
  }
  return all.map((a, k) => (a > 0 ? solid[k]! / a : 0));
}

/**
 * Auto-detail (SPEC §5.4, R59.4): when no colour is flagged as detail, a colour that is more than
 * ΔE2000 40 from the dominant colour and has under 15 % of the labelled pixels and at least `guard.minPixels` of them (0.05 % without a guard) gets
 * detail priority, so small contrasting marks (eyes, a red comb) win their beads. With a
 * `guard`, at least half of the colour's flat pixels must also lie in connected areas of at
 * least `guard.minArea` px, so rims, edge blends and noise are not marks. Returns `userDetail`
 * itself when any colour is flagged.
 * @param labels colour index per pixel, `-1` = background
 * @param labs Lab per colour index
 * @param userDetail detail flag per colour index
 */
export function autoDetail(
  labels: Int16Array,
  labs: readonly Lab[],
  userDetail: readonly boolean[],
  guard?: DetailGuard,
): readonly boolean[] {
  if (userDetail.includes(true)) return userDetail;
  const count = new Array<number>(labs.length).fill(0);
  let total = 0;
  for (const k of labels)
    if (k >= 0) {
      count[k]!++;
      total++;
    }
  if (total === 0) return userDetail;
  const dominant = count.reduce((best, n, k) => (n > count[best]! ? k : best), 0);
  const solid = guard ? compactness(labels, labs.length, guard) : null;
  return count.map(
    (n, k) =>
      (guard ? n >= guard.minPixels : n >= MIN_SHARE * total) &&
      n < MAX_SHARE * total &&
      deltaE2000(labs[k]!, labs[dominant]!) > MIN_DISTANCE &&
      (solid === null || solid[k]! >= COMPACT),
  );
}
