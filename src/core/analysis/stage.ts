import { BEAD_TYPES } from '../geometry';
import { boundingBox } from '../imaging/crop';
import type { Box, Mask, RgbaImage } from '../imaging/types';
import { hexToLab } from '../palette/color';
import type { Lab, PaletteEntry } from '../palette/types';
import { restoreThinStrokes, type DetailsCache } from './details';
import { computeFit } from './fit';
import { labelPixels, workingCrop, workingScale, type LabelImage } from './label';
import {
  foregroundMask,
  guardSize,
  makeNearest,
  orientImage,
  sampleBackground,
  type NearestFn,
  type ResolvedBackground,
} from './prepare';
import { reducePalette } from './reduce';
import {
  lineParams,
  resolveFit,
  resolveMargin,
  type AnalysisSettings,
  type AnalysisTarget,
  type ResolvedFit,
} from './settings';
import { makeUnmix, type UnmixFn } from './unmix';

/** Stage timer: records the time since the previous lap under `stage`. */
export type Lap = (stage: string) => void;

/** Everything up to the working scale. */
export interface Prepared {
  readonly panel: boolean;
  readonly detail: readonly boolean[];
  readonly labs: readonly Lab[];
  readonly nearest: NearestFn;
  readonly minLineWidthBeads: number;
  readonly detailThreshold: number;
  readonly work: RgbaImage;
  readonly mask: Mask;
  readonly mode: ResolvedBackground;
  readonly fitMode: ResolvedFit;
  readonly margin: number;
  /** Panel background index (`-1`: not yet known or shaped). */
  readonly bg: number;
  /** Most common palette colour of the removed background (`-1`: none). */
  readonly outside: number;
  readonly unmix: UnmixFn | null;
  readonly box: Box | null;
  /** Working downscale, working px per bead and minimum line width in working px (0 without box). */
  readonly k: number;
  readonly pxPerBead: number;
  readonly minWpx: number;
}

/**
 * Size guard, orientation, foreground mask, background sample and working scale (SPEC §5.2).
 * @throws if `panelBackground` is unknown
 */
export function prepareStage(
  img: RgbaImage,
  target: AnalysisTarget,
  palette: readonly PaletteEntry[],
  settings: AnalysisSettings,
  lap: Lap = () => {},
): Prepared {
  const panel = target.mode === 'panel';
  const detail = palette.map((e) => !!e.detail);
  const { minLineWidthBeads, detailThreshold } = lineParams(settings.lineSensitivity);
  const labs = palette.map((e) => hexToLab(e.hex));
  const nearest = makeNearest(labs);
  const work = orientImage(guardSize(img), settings);
  lap('resample');
  const { mask, mode } = foregroundMask(work, settings, target.width * target.height);
  const fitMode = resolveFit(settings.fit, mode);
  const margin = resolveMargin(settings, target.mode, fitMode);
  lap('mask');
  const sample = sampleBackground(work, mask, nearest);
  let bg = -1;
  if (panel && settings.panelBackground !== 'auto') {
    bg = palette.findIndex((e) => e.id === settings.panelBackground);
    if (bg < 0) throw new Error(`unknown panelBackground ${settings.panelBackground}`);
  } else if (panel) bg = sample.index;
  const keyed = mode === 'borderKey' || mode === 'threshold';
  const unmix =
    keyed && sample.rgb
      ? makeUnmix(
          sample.rgb,
          palette.map((e) => e.hex),
        )
      : null;
  const box = boundingBox(mask);
  let k = 1;
  let pxPerBead = 0;
  let minWpx = 0;
  if (box) {
    const bw = BEAD_TYPES[target.beadType].widthMm;
    const srcPxPerBead = bw / computeFit(box.width, box.height, target, margin, fitMode).mmPerPx;
    k = workingScale(srcPxPerBead);
    pxPerBead = srcPxPerBead * k;
    minWpx = minLineWidthBeads * pxPerBead;
  }
  return {
    panel,
    detail,
    labs,
    nearest,
    minLineWidthBeads,
    detailThreshold,
    work,
    mask,
    mode,
    fitMode,
    margin,
    bg,
    outside: sample.index,
    unmix,
    box,
    k,
    pxPerBead,
    minWpx,
  };
}

/** Result of {@link labelStage}. */
export interface Labelled {
  /** Reduced labels (palette indices) at working resolution. */
  readonly l: LabelImage;
  /** Palette histogram before reduction. */
  readonly hist: readonly number[];
  /** Panel background index after the fallback to the most common colour. */
  readonly bg: number;
  /** Pixels the Details slider kept from the unfiltered labels (R42), only when it is on. */
  readonly restored?: Uint8Array;
  /** Working crop (padded), `null` without foreground. */
  readonly crop: { readonly img: RgbaImage; readonly pad: number } | null;
}

/** Working crop, labelling (masked median, unmixing) and palette reduction (SPEC §5.2, R19, R22). */
export function labelStage(
  p: Prepared,
  palette: readonly PaletteEntry[],
  settings: AnalysisSettings,
  lap: Lap = () => {},
  detailsCache?: DetailsCache,
): Labelled {
  let l: LabelImage = { labels: new Int16Array(0), cover: new Float32Array(0), w: 0, h: 0 };
  let hist = new Array<number>(palette.length).fill(0);
  let crop: Labelled['crop'] = null;
  if (p.box) {
    const pad = p.minWpx > 1 ? Math.ceil(p.minWpx / 2) + 2 : 1;
    const c = workingCrop(p.work, p.mask, p.box, p.k, pad);
    lap('crop');
    const labelled = labelPixels(c.img, c.mask, p.nearest, p.detail, p.unmix);
    hist = labelled.hist;
    l = { labels: labelled.labels, cover: labelled.cover, w: labelled.w, h: labelled.h };
    crop = { img: c.img, pad };
    lap('label');
  }
  const bg = p.panel && p.bg < 0 ? argmax(hist) : p.bg;
  const red = reducePalette(hist, palette, p.labs, {
    maxColors: settings.maxColors,
    pinned: bg >= 0 ? [bg] : [],
  });
  for (let q = 0; q < l.labels.length; q++)
    if (l.labels[q]! >= 0) l.labels[q] = red.map[l.labels[q]!]!;
  lap('reduce');
  if (!crop || !(settings.details > 0) || p.minWpx <= 1) return { l, hist, bg, crop };
  const d = crop.img.data;
  const raw = new Int16Array(l.labels.length).fill(-1);
  for (let q = 0; q < raw.length; q++)
    if (l.labels[q]! >= 0) raw[q] = red.map[p.nearest(d[q * 4]!, d[q * 4 + 1]!, d[q * 4 + 2]!)]!;
  const dominant = p.panel ? bg : dominantLabel(l, palette.length);
  const restored = restoreThinStrokes(l, raw, dominant, p.minWpx, settings.details, {
    labs: p.labs,
    outside: p.outside,
    ...(detailsCache ? { cache: detailsCache } : {}),
  });
  lap('details');
  return { l: restored.l, hist, bg, crop, restored: restored.changed };
}

/** Index of the largest count (ties: lower index); 0 when all counts are 0. */
export const argmax = (xs: readonly number[]): number =>
  xs.reduce((best, x, i) => (x > xs[best]! ? i : best), 0);

/** Most frequent label (ties: lower index), `-1` when nothing is labelled. */
export function dominantLabel(l: LabelImage, n: number): number {
  const area = new Array<number>(n).fill(0);
  for (const k of l.labels) if (k >= 0) area[k]!++;
  const best = argmax(area);
  return area[best]! > 0 ? best : -1;
}
