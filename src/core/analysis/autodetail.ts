import { deltaE2000 } from '../palette/deltaE';
import type { Lab } from '../palette/types';

const MIN_DISTANCE = 40;
const MAX_SHARE = 0.15;

/**
 * Auto-detail (SPEC §5.4, R59.4): when no colour is flagged as detail, a colour that is more than
 * ΔE2000 40 from the dominant colour and has under 15 % of the labelled pixels gets detail
 * priority, so small contrasting marks (eyes, a red comb) win their beads. Returns `userDetail`
 * itself when any colour is flagged.
 * @param labels colour index per pixel, `-1` = background
 * @param labs Lab per colour index
 * @param userDetail detail flag per colour index
 */
export function autoDetail(
  labels: Int16Array,
  labs: readonly Lab[],
  userDetail: readonly boolean[],
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
  return count.map(
    (n, k) =>
      n > 0 && n < MAX_SHARE * total && deltaE2000(labs[k]!, labs[dominant]!) > MIN_DISTANCE,
  );
}
