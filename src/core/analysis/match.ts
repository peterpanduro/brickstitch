import { deltaE2000, nearestIndex } from '../palette/deltaE';
import type { Lab } from '../palette/types';

const SATURATED = 20;
const NEUTRAL = 12;
const HUE_TOLERANCE = 45;
const LOOSE_DISTANCE = 30;

const chroma = (lab: Lab): number => Math.hypot(lab.a, lab.b);

const hueGap = (x: Lab, y: Lab): number => {
  const d = Math.abs(Math.atan2(x.b, x.a) - Math.atan2(y.b, y.a)) * (180 / Math.PI);
  return d > 180 ? 360 - d : d;
};

/** Palette entry chosen for a colour cluster and its ΔE2000 distance. */
export interface EntryMatch {
  readonly index: number;
  readonly deltaE: number;
}

/**
 * Entry for a cluster centroid (SPEC R59.5): the nearest by ΔE2000, except that a saturated
 * cluster (chroma ≥ 20) whose nearest entry is near-neutral (chroma < 12) takes the nearest
 * entry of the same hue (within 45°, chroma ≥ 12) when one is within ΔE2000 30 and at most max(2·d, d+10) for the nearest entry's distance d. The distance
 * reported is always to the entry returned.
 * @throws if `labs` is empty
 */
export function matchEntry(lab: Lab, labs: readonly Lab[]): EntryMatch {
  const best = nearestIndex(lab, labs);
  if (best < 0) throw new Error('matchEntry: empty palette');
  let index = best;
  let deltaE = deltaE2000(lab, labs[best]!);
  if (chroma(lab) >= SATURATED && chroma(labs[best]!) < NEUTRAL) {
    const limit = Math.min(LOOSE_DISTANCE, Math.max(2 * deltaE, deltaE + 10));
    labs.forEach((e, i) => {
      if (chroma(e) < NEUTRAL || hueGap(lab, e) > HUE_TOLERANCE) return;
      const d = deltaE2000(lab, e);
      if (d <= limit && (index === best || d < deltaE)) {
        index = i;
        deltaE = d;
      }
    });
  }
  return { index, deltaE };
}
