import { hexToLab } from './color';
import type { Lab, PaletteEntry } from './types';

const RAD = Math.PI / 180;
const POW25_7 = 25 ** 7;

const hueDeg = (b: number, a: number): number => {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / RAD;
  return h < 0 ? h + 360 : h;
};

/** CIEDE2000 colour difference (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(a: Lab, b: Lab): number {
  const cBar = (Math.hypot(a.a, a.b) + Math.hypot(b.a, b.b)) / 2;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)));
  const a1 = (1 + g) * a.a;
  const a2 = (1 + g) * b.a;
  const c1 = Math.hypot(a1, a.b);
  const c2 = Math.hypot(a2, b.b);
  const h1 = hueDeg(a.b, a1);
  const h2 = hueDeg(b.b, a2);

  const dL = b.L - a.L;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * RAD) / 2);

  const lBar = (a.L + b.L) / 2;
  const cBarP = (c1 + c2) / 2;
  let hBar = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hBar /= 2;
    else hBar = (hBar + (hBar < 360 ? 360 : -360)) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * RAD) +
    0.24 * Math.cos(2 * hBar * RAD) +
    0.32 * Math.cos((3 * hBar + 6) * RAD) -
    0.2 * Math.cos((4 * hBar - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cP7 / (cP7 + POW25_7));
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(2 * dTheta * RAD) * rC;

  const l = dL / sL;
  const c = dC / sC;
  const h = dH / sH;
  return Math.sqrt(l * l + c * c + h * h + rT * c * h);
}

/**
 * Index of the Lab with the smallest ΔE2000 to `lab` (ties: earliest); `-1` when `labs` is
 * empty. Callers precompute `labs` once per palette.
 */
export function nearestIndex(lab: Lab, labs: readonly Lab[]): number {
  let best = -1;
  let bestD = Infinity;
  labs.forEach((x, i) => {
    const d = deltaE2000(lab, x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Entry with the smallest ΔE2000 to `lab`; convenience wrapper over {@link nearestIndex}.
 * @throws if `entries` is empty.
 */
export function nearest(lab: Lab, entries: readonly PaletteEntry[]): PaletteEntry {
  const e =
    entries[
      nearestIndex(
        lab,
        entries.map((x) => hexToLab(x.hex)),
      )
    ];
  if (!e) throw new Error('nearest: empty palette');
  return e;
}
