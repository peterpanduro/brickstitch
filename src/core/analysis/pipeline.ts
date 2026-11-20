import { chooseLadder } from '../feasibility/ladder';
import { prune } from '../feasibility/prune';
import { BEAD_TYPES, type Coord } from '../geometry';
import type { Box, RgbaImage } from '../imaging/types';
import type { ColorId, PaletteEntry } from '../palette/types';
import { createPattern, getCell } from '../pattern/ops';
import type { Pattern } from '../pattern/types';
import { ringCandidates } from '../ring/search';
import { voteWeights } from './denoise';
import { despeckle } from './despeckle';
import {
  backgroundLayer,
  detailsLayer,
  labelLayer,
  lineLayers,
  type AnalysisDebug,
  type DebugTransform,
  type ThinCache,
} from './debug';
import { computeFit } from './fit';
import { cropLabels, cropToBox, labelBox, type LabelImage } from './label';
import type { ResolvedBackground } from './prepare';
import { rasterise, type IndexGrid } from './rasterise';
import { eraseRings, paintRings, planRings, type RingPlan, type RingSearch } from './ring-fix';
import { detectRings, type DetectedRing } from './rings';
import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type AnalysisTarget,
  type ResolvedFit,
} from './settings';
import { dominantLabel, labelStage, prepareStage } from './stage';
import { thickenLabels } from './thicken';
import { thickenDetails, type DetailsCache } from './details';

const changedCells = (a: IndexGrid, b: IndexGrid): number =>
  a.reduce((n, row, r) => n + row.filter((c, i) => c !== b[r]![i]).length, 0);

/** Diagnostics of one {@link analyseImage} run. */
export interface AnalysisStats {
  readonly background: ResolvedBackground;
  /** Fit mode used (what `auto` resolved to). */
  readonly fit: ResolvedFit;
  readonly workingWidth: number;
  readonly workingHeight: number;
  readonly foregroundPixels: number;
  /** Lattice mm per working-resolution pixel (0 for an empty image). */
  readonly mmPerPx: number;
  readonly minLineWidthBeads: number;
  readonly minLineWidthPx: number;
  readonly detailThreshold: number;
  /** Panel fill colour, `null` for shaped patterns. */
  readonly panelBackground: ColorId | null;
  /** Beads removed by `autoPrune`. */
  readonly prunedBeads: number;
  /** Cells whose colour `despeckle` changed (R52.11; 0 with `despeckle` off). */
  readonly despeckledBeads: number;
  /** Verified ring strokes in the source (R37; 0 with `fixRings` off). */
  readonly ringsFound: number;
  /** Rings replaced by optimiser rings. */
  readonly ringsReplaced: number;
  /** Replaced rings: lattice cells, width, fitted centre (lattice-local mm), beads pruned. */
  readonly rings: readonly AnalysisRing[];
  /** Milliseconds per stage, in pipeline order. */
  readonly timings: Readonly<Record<string, number>>;
}

/** A ring replaced by {@link analyseImage} (R37). */
export interface AnalysisRing {
  readonly cells: readonly Coord[];
  readonly widthBeads: number;
  readonly centreMm: { readonly x: number; readonly y: number };
  /** Ring beads removed by `autoPrune`. */
  readonly prunedBeads: number;
}

/** Result of {@link analyseImage}. */
export interface ImageAnalysis {
  readonly pattern: Pattern;
  /** Palette entries used by the pattern, in input palette order (also `pattern.palette`). */
  readonly usedPalette: readonly PaletteEntry[];
  readonly stats: AnalysisStats;
  /** Debug layers (R39), only with `deps.debug`. */
  readonly debug?: AnalysisDebug;
}

/** Injectable dependencies. */
export interface AnalyseDeps {
  /** Millisecond clock for stage timings. */
  readonly now?: () => number;
  /** Ring optimiser for `fixRings` (default `ringCandidates`; the UI passes a memoised one). */
  readonly ringCandidates?: RingSearch;
  /** Also return {@link AnalysisDebug} layers (R39); off: output and work are unchanged. */
  readonly debug?: boolean;
  /** Skeleton cache for the debug `thin` layer (the UI keeps one per import dialog). */
  readonly thinCache?: ThinCache;
  /** Last results of the Details / outline steps (R42; the UI keeps one per import dialog). */
  readonly detailsCache?: DetailsCache;
}

const defaultNow = (): number => Date.now();

/**
 * Image → pattern (SPEC §5.2 with D5, R8, R10, R31): size guard, rotation/mirror, foreground mask, crop and working
 * resample (≈ 12 px per bead), masked median, edge unmixing, palette reduction, line thickening, fit,
 * supersampled rasterisation with coverage and detail priority, panel fill, despeckle, and
 * (shaped) pruning of floating beads. Deterministic for equal inputs.
 * @throws if the target size is invalid, the palette is empty, or `panelBackground` is unknown.
 */
export function analyseImage(
  img: RgbaImage,
  target: AnalysisTarget,
  palette: readonly PaletteEntry[],
  settings: AnalysisSettings = DEFAULT_SETTINGS,
  deps: AnalyseDeps = {},
): ImageAnalysis {
  if (palette.length === 0) throw new Error('analyseImage: empty palette');
  const now = deps.now ?? defaultNow;
  const timings: Record<string, number> = {};
  let t0 = now();
  const lap = (stage: string): void => {
    const t = now();
    timings[stage] = t - t0;
    t0 = t;
  };
  const prep = prepareStage(img, target, palette, settings, lap);
  const { panel, detail, minLineWidthBeads, detailThreshold, work, mask, mode, fitMode, margin } =
    prep;
  const { box, minWpx } = prep;
  const {
    l,
    hist,
    bg,
    crop,
    restored,
    detail: rasterDetail,
  } = labelStage(prep, palette, settings, lap, deps.detailsCache);
  const labelT: DebugTransform =
    deps.debug && box && crop
      ? labelTransform(img, work, settings, box, crop.img, crop.pad)
      : { x0: 0, y0: 0, sx: 1, sy: 1 };

  const detected = settings.fixRings && box ? detectIn(l, target, margin, fitMode) : [];
  lap('rings');
  const dominant = panel ? bg : dominantLabel(l, palette.length);
  const details = restored ? settings.details : 0;
  const outline = minWpx > 1 && mode !== 'none';
  /** Line thickening (D5), then thin outline strokes and the Details slider's strokes (R42). */
  const ctx = {
    labs: prep.labs,
    outside: prep.outside,
    ...(deps.detailsCache ? { cache: deps.detailsCache } : {}),
  };
  const thicken = (src: LabelImage): { src: LabelImage; l: LabelImage; changed?: Uint8Array } => {
    const t = minWpx > 1 ? thickenLabels(src, minWpx, detail) : src;
    return details > 0 || outline
      ? { src, ...thickenDetails(src, t, minWpx, details, dominant, detail, ctx, outline) }
      : { src, l: t };
  };
  let shown = thicken(l);
  const thickened = shown.l;
  const thick = cropLabels(thickened);
  const fit = computeFit(thick.w, thick.h, target, margin, fitMode);
  const frame = { fit, x0: thick.x0, y0: thick.y0 };
  const base = createPattern({
    beadType: target.beadType,
    mode: target.mode,
    width: target.width,
    height: target.height,
    palette,
    fill: panel ? palette[bg]!.id : null,
  });
  const raster = (src: LabelImage, priority = rasterDetail): IndexGrid =>
    rasterise({
      labels: src.labels,
      cover: src.cover,
      weights: voteWeights(src.labels, src.cover, src.w, src.h),
      imgW: src.w,
      imgH: src.h,
      fit,
      beadType: target.beadType,
      width: target.width,
      height: target.height,
      supersample: settings.supersample,
      coverage: settings.coverage,
      detailThreshold,
      detail: priority,
    });
  lap('thicken');
  let cells: IndexGrid = raster(thick);
  const plans: RingPlan[] = detected.length
    ? planRings(detected, {
        ...frame,
        pattern: base,
        search: deps.ringCandidates ?? ringCandidates,
        source: rasterDetail === detail ? cells : raster(thick, detail),
      })
    : [];
  if (plans.length > 0) {
    const erased = eraseRings(
      l,
      plans.map((p) => p.ring),
    );
    shown = thicken(erased);
    cells = raster(
      cropToBox(shown.l, {
        x: thick.x0,
        y: thick.y0,
        width: thick.w,
        height: thick.h,
      }),
    );
  }
  lap('rasterise');
  if (panel) cells = cells.map((row) => row.map((c) => (c < 0 ? bg : c)));
  const painted = plans.length ? paintRings(cells, plans, frame, target.beadType) : undefined;
  let despeckledBeads = 0;
  if (settings.despeckle) {
    const before = cells;
    cells = despeckle(cells, rasterDetail, painted?.locked);
    despeckledBeads = changedCells(before, cells);
  }
  lap('despeckle');

  let pattern: Pattern = {
    ...base,
    cells: cells.map((row) => row.map((c) => (c < 0 ? null : palette[c]!.id))),
  };
  let prunedBeads = 0;
  if (!panel && settings.autoPrune) {
    const ladder = chooseLadder(pattern);
    if (ladder !== null) {
      const pruned = prune(pattern, ladder);
      prunedBeads = countBeads(pattern) - countBeads(pruned);
      pattern = pruned;
    }
  }
  const used = new Set(pattern.cells.flat());
  const usedPalette = palette.filter((e) => used.has(e.id));
  pattern = { ...pattern, palette: usedPalette };
  lap('prune');

  const result: ImageAnalysis = {
    pattern,
    usedPalette,
    stats: {
      background: mode,
      fit: fitMode,
      workingWidth: work.width,
      workingHeight: work.height,
      foregroundPixels: hist.reduce((a, b) => a + b, 0),
      mmPerPx: box ? fit.mmPerPx : 0,
      minLineWidthBeads,
      minLineWidthPx: minWpx,
      detailThreshold,
      panelBackground: panel ? palette[bg]!.id : null,
      prunedBeads,
      despeckledBeads,
      ringsFound: detected.length,
      ringsReplaced: plans.length,
      rings: plans.map((p, i) => ({
        cells: p.cells,
        widthBeads: p.widthBeads,
        centreMm: p.centreMm,
        prunedBeads: painted!.painted[i]!.filter((c) => getCell(pattern, c) === null).length,
      })),
      timings,
    },
  };
  if (!deps.debug) return result;
  const g = guardScale(img, work, settings);
  const lines = lineLayers(
    shown.src,
    shown.l,
    minWpx,
    labelT,
    dominant,
    deps.thinCache,
    shown.changed,
  );
  return {
    ...result,
    debug: {
      background: mode,
      backgroundMask: backgroundLayer(mask, g.x, g.y),
      added: lines.added,
      details: detailsLayer(l.w, l.h, labelT, restored, shown.changed),
      get thin() {
        return lines.thin;
      },
      minLineWidthPx: minWpx,
      labels: labelLayer(withRings(shown, thickened, l), labelT),
      palette: palette.map((e) => e.hex),
    },
  };
}

/**
 * The rasterised label image: `shown` (after ring erasing, when rings were replaced) with the
 * erased ring strokes put back from `before` (thickened, unerased), where the replacement rings go.
 */
function withRings(
  shown: { src: LabelImage; l: LabelImage },
  before: LabelImage,
  l: LabelImage,
): LabelImage {
  if (shown.src === l) return shown.l;
  const labels = Int16Array.from(shown.l.labels);
  for (let p = 0; p < labels.length; p++)
    if (shown.src.labels[p] !== l.labels[p]) labels[p] = before.labels[p]!;
  return { ...shown.l, labels };
}

/** Oriented input px per `work` px on each axis (the 2048 px guard). */
function guardScale(
  img: RgbaImage,
  work: RgbaImage,
  s: AnalysisSettings,
): { x: number; y: number } {
  const swap = s.rotation === 90 || s.rotation === 270;
  return {
    x: (swap ? img.height : img.width) / work.width,
    y: (swap ? img.width : img.height) / work.height,
  };
}

/** Label-image px → oriented input px: `box` of `work`, resampled to the unpadded `crop`, padded. */
function labelTransform(
  img: RgbaImage,
  work: RgbaImage,
  s: AnalysisSettings,
  box: Box,
  crop: { width: number; height: number },
  pad: number,
): DebugTransform {
  const g = guardScale(img, work, s);
  const kx = box.width / (crop.width - 2 * pad);
  const ky = box.height / (crop.height - 2 * pad);
  return {
    x0: (box.x - pad * kx) * g.x,
    y0: (box.y - pad * ky) * g.y,
    sx: kx * g.x,
    sy: ky * g.y,
  };
}

/** Ring strokes in `l`, radius limits from the pre-thicken fit (0.4 bead to half the lattice). */
function detectIn(
  l: LabelImage,
  target: AnalysisTarget,
  margin: number,
  fitMode: ResolvedFit,
): DetectedRing[] {
  const b = labelBox(l);
  if (!b) return [];
  const f = computeFit(b.width, b.height, target, margin, fitMode);
  const t = BEAD_TYPES[target.beadType];
  return detectRings(l, {
    minRadiusPx: (0.4 * t.widthMm) / Math.max(f.mmPerPx, f.mmPerPxY),
    maxRadiusPx:
      Math.max(
        (target.width * t.widthMm) / f.mmPerPx,
        (target.height * t.rowPitchMm) / f.mmPerPxY,
      ) / 2,
  });
}

const countBeads = (p: Pattern): number =>
  p.cells.reduce((n, row) => n + row.filter((c) => c !== null).length, 0);
