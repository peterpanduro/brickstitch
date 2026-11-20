import {
  analyseImage,
  type AnalysisSettings,
  type AnalysisTarget,
  type ImageAnalysis,
} from '../../src/core/analysis';
import { computeFit } from '../../src/core/analysis/fit';
import { prepareStage } from '../../src/core/analysis/stage';
import { BEAD_TYPES, rowLength } from '../../src/core/geometry';
import { hexToLab, rgbToLab } from '../../src/core/palette/color';
import { deltaE2000 } from '../../src/core/palette/deltaE';
import type { PaletteEntry } from '../../src/core/palette/types';
import type { QualityImage } from './images';

/** A foreground bead of the result: its ground-truth region and bead colour. */
export interface BeadRegion {
  readonly region: number;
  readonly colour: string;
}

/** Mean of `xs`, 0 when empty. */
export const meanOf = (xs: readonly number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** Value at rank `floor(n · p)` of the sorted `xs`, 0 when empty. */
export function percentile(xs: readonly number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
}

/** Bead colour counts (hex) per region id `0..n-1`, in first-seen order. */
export function tallyRegions(beads: readonly BeadRegion[], n: number): Map<string, number>[] {
  const out = Array.from({ length: n }, () => new Map<string, number>());
  for (const b of beads) out[b.region]!.set(b.colour, (out[b.region]!.get(b.colour) ?? 0) + 1);
  return out;
}

/** Most frequent colour of a tally (ties: first seen), `null` when empty. */
export function dominantColour(tally: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of tally)
    if (k > n) {
      best = c;
      n = k;
    }
  return best;
}

/** Palette hex nearest (ΔE2000) to the sRGB colour `rgb`. */
export function nearestHex(
  rgb: readonly [number, number, number],
  hexes: readonly string[],
): string {
  const lab = rgbToLab([...rgb]);
  let best = hexes[0]!;
  let d = Infinity;
  for (const h of hexes) {
    const e = deltaE2000(lab, hexToLab(h));
    if (e < d) {
      d = e;
      best = h;
    }
  }
  return best;
}

/**
 * Share of a region's beads whose colour equals `expected`; 0 when `expected` equals the enclosing
 * region's expected colour (the region cannot be told apart) or the region has no beads.
 */
export function regionRecall(
  tally: ReadonlyMap<string, number>,
  expected: string,
  enclosingExpected: string | null,
): number {
  let total = 0;
  for (const k of tally.values()) total += k;
  if (!total || expected === enclosingExpected) return 0;
  return (tally.get(expected) ?? 0) / total;
}

/** Intersection over union of `mask` and the pixels whose ground-truth region is in `fg`. */
export function maskIou(mask: Uint8Array, gt: Int16Array, fg: readonly number[]): number {
  const want = new Set(fg);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i] !== 0;
    const b = want.has(gt[i]!);
    if (a && b) inter++;
    if (a || b) union++;
  }
  return union ? inter / union : 1;
}

/** Everything measured on one analysed case. */
export interface Measure {
  readonly analysis: ImageAnalysis;
  readonly beads: number;
  readonly meanDE: number;
  readonly p90DE: number;
  readonly iou: number;
  /** Bead colour tally per region id. */
  readonly tally: readonly Map<string, number>[];
  /** Recall per region id (see {@link regionRecall}). */
  readonly recall: readonly number[];
  /** ΔE2000 between each region's dominant bead colour and its true mean (`NaN`: no beads). */
  readonly regionDE: readonly number[];
  /** Hex of the used palette colour nearest to each region's true mean. */
  readonly expected: readonly string[];
}

/** Mean sRGB of the pixels of each region (`null` for an empty region). */
function regionMeans(q: QualityImage): ([number, number, number] | null)[] {
  const acc = q.regions.map(() => [0, 0, 0, 0]);
  for (let p = 0; p < q.gt.length; p++) {
    const a = acc[q.gt[p]!]!;
    for (let k = 0; k < 3; k++) a[k]! += q.img.data[p * 4 + k]!;
    a[3]!++;
  }
  return acc.map((a) => (a[3] ? [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!] : null));
}

/**
 * Runs {@link analyseImage} on `q` and measures the result against the ground truth: each bead
 * (foreground by the pipeline's own mask, at least `coverage` covered) belongs to the region most
 * of its source pixels belong to.
 */
export function measure(
  q: QualityImage,
  target: AnalysisTarget,
  palette: readonly PaletteEntry[],
  settings: AnalysisSettings,
): Measure {
  const analysis = analyseImage(q.img, target, palette, settings);
  const prep = prepareStage(q.img, target, palette, settings);
  const { width: W, height: H } = q.img;
  if (prep.work.width !== W || prep.work.height !== H) throw new Error('measure: image resized');
  const box = prep.box ?? { x: 0, y: 0, width: W, height: H };
  const fit = computeFit(box.width, box.height, target, prep.margin, prep.fitMode);
  const { widthMm: bw, rowPitchMm: bh } = BEAD_TYPES[target.beadType];
  const labOf = new Map(analysis.pattern.palette.map((e) => [e.id, hexToLab(e.hex)]));
  const hexOf = new Map(analysis.pattern.palette.map((e) => [e.id, e.hex]));
  const beads: BeadRegion[] = [];
  const des: number[] = [];
  for (let r = 0; r < target.height; r++)
    for (let i = 0; i < rowLength(target.width, r); i++) {
      const left = i * bw + ((r & 1) * bw) / 2;
      const top = r * bh;
      const x0 = Math.max(0, Math.floor(box.x + (left - fit.ox) / fit.mmPerPx));
      const x1 = Math.min(W, Math.ceil(box.x + (left + bw - fit.ox) / fit.mmPerPx));
      const y0 = Math.max(0, Math.floor(box.y + (top - fit.oy) / fit.mmPerPxY));
      const y1 = Math.min(H, Math.ceil(box.y + (top + bh - fit.oy) / fit.mmPerPxY));
      let n = 0;
      let fg = 0;
      const rgb = [0, 0, 0];
      const votes = new Map<number, number>();
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const p = y * W + x;
          n++;
          if (!prep.mask.data[p]) continue;
          fg++;
          for (let k = 0; k < 3; k++) rgb[k]! += q.img.data[p * 4 + k]!;
          votes.set(q.gt[p]!, (votes.get(q.gt[p]!) ?? 0) + 1);
        }
      const id = analysis.pattern.cells[r]![i] ?? null;
      if (id === null || !n || fg / n < settings.coverage) continue;
      const lab = rgbToLab([rgb[0]! / fg, rgb[1]! / fg, rgb[2]! / fg]);
      des.push(deltaE2000(lab, labOf.get(id)!));
      const region = [...votes].sort((a, b) => b[1] - a[1])[0]![0];
      beads.push({ region, colour: hexOf.get(id)! });
    }
  const used = analysis.pattern.palette.map((e) => e.hex);
  const means = regionMeans(q);
  const expected = means.map((m) => (m ? nearestHex(m, used) : ''));
  const tally = tallyRegions(beads, q.regions.length);
  return {
    analysis,
    beads: beads.length,
    meanDE: meanOf(des),
    p90DE: percentile(des, 0.9),
    iou: maskIou(prep.mask.data, q.gt, q.fg),
    tally,
    expected,
    recall: tally.map((t, g) => {
      const e = q.enclosing[g]!;
      return regionRecall(t, expected[g]!, e >= 0 ? expected[e]! : null);
    }),
    regionDE: tally.map((t, g) => {
      const c = dominantColour(t);
      const m = means[g];
      return c && m ? deltaE2000(rgbToLab(m), hexToLab(c)) : NaN;
    }),
  };
}
