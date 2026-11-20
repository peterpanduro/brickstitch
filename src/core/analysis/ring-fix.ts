import { BEAD_TYPES, extentMm, type BeadTypeId, type Coord } from '../geometry';
import type { Pattern } from '../pattern/types';
import { ringAnchorCentred, ringAnchorFromClick, ringCellsAt } from '../ring/place';
import { ON_BEAD_CENTRES } from '../ring/search';
import type { RingCandidate, RingSearchParams } from '../ring/types';
import type { Fit } from './fit';
import type { LabelImage } from './label';
import type { IndexGrid } from './rasterise';
import { strokeLabelAt, type DetectedRing } from './rings';

/** Ring optimiser, best candidate first (`ringCandidates` or a memoised wrapper). */
export type RingSearch = (p: RingSearchParams) => readonly RingCandidate[];

/** A detected ring and the lattice cells of its replacement. */
export interface RingPlan {
  readonly ring: DetectedRing;
  readonly cells: readonly Coord[];
  readonly widthBeads: number;
  /** Fitted ring centre in lattice-local mm. */
  readonly centreMm: { readonly x: number; readonly y: number };
}

/** Placement of the working image on the lattice: fit of the crop at offset `(x0, y0)`. */
export interface RingFrame {
  readonly fit: Fit;
  readonly x0: number;
  readonly y0: number;
}

/** Context of {@link planRings}. */
export interface PlanContext extends RingFrame {
  /** Target lattice (only its size, mode and bead type are used). */
  readonly pattern: Pattern;
  readonly search: RingSearch;
  /**
   * Rasterisation of the unerased image; its beads with the stroke label inside the annulus are
   * the source stroke that candidate widths are matched against. Omitted: the widest fit wins.
   */
  readonly source?: IndexGrid;
}

const MAX_ASPECT = 1.35;
const MAX_STROKE_BEADS = 1.75;
/** Optimiser thickness floor (its default minimum); thinner rings break up. */
const MIN_THICKNESS_MM = 0.55;

type Point = { readonly x: number; readonly y: number };

/** Lattice-local mm of working pixel `(px, py)`. */
const toMm = (f: RingFrame, px: number, py: number): Point => ({
  x: f.fit.ox + (px - f.x0 + 0.5) * f.fit.mmPerPx,
  y: f.fit.oy + (py - f.y0 + 0.5) * f.fit.mmPerPxY,
});

/** Working pixel of the centre of bead `c`. */
function beadPx(f: RingFrame, c: Coord, beadType: BeadTypeId): Point {
  const t = BEAD_TYPES[beadType];
  return {
    x: (((c.h + 1) * t.widthMm) / 2 - f.fit.ox) / f.fit.mmPerPx - 0.5 + f.x0,
    y: ((c.r + 0.5) * t.rowPitchMm - f.fit.oy) / f.fit.mmPerPxY - 0.5 + f.y0,
  };
}

const cellKey = (c: Coord): string => `${c.r},${c.h}`;

/** Source beads of the stroke: stroke label, centre within half a bead of the annulus. */
function strokeCells(ctx: PlanContext, ring: DetectedRing, source: IndexGrid): Coord[] {
  const bt = ctx.pattern.beadType;
  const halfBeadPx = BEAD_TYPES[bt].widthMm / 2 / Math.min(ctx.fit.mmPerPx, ctx.fit.mmPerPxY);
  const reach = ring.w / 2 + halfBeadPx;
  const out: Coord[] = [];
  source.forEach((row, r) =>
    row.forEach((k, i) => {
      if (k < 0) return;
      const c = { r, h: 2 * i + (r & 1) };
      const p = beadPx(ctx, c, bt);
      const dx = p.x - ring.cx;
      const dy = p.y - ring.cy;
      if (Math.abs(Math.hypot(dx, dy) - ring.rM) > reach) return;
      if (strokeLabelAt(ring, Math.atan2(dy, dx)) === k) out.push(c);
    }),
  );
  return out;
}

/** Best IoU of `cells` with `ref` over shifts of up to one row and one bead (shape match). */
const iou = (cells: readonly Coord[], ref: ReadonlySet<string>): number => {
  let best = 0;
  for (let dr = -1; dr <= 1; dr++)
    for (let dh = -2; dh <= 2; dh++) {
      if ((dh - dr) % 2 !== 0) continue;
      const both = cells.filter((c) => ref.has(cellKey({ r: c.r + dr, h: c.h + dh }))).length;
      const union = cells.length + ref.size - both;
      if (union > 0) best = Math.max(best, both / union);
    }
  return best;
};

/** Thickness search range from the source stroke width: half of it ± 25 %, floor 0.55 mm. */
function thicknessOf(ring: DetectedRing, ctx: PlanContext): { min: number; max: number } {
  const half = (ring.w * Math.max(ctx.fit.mmPerPx, ctx.fit.mmPerPxY)) / 2;
  const q = (x: number) => Math.max(MIN_THICKNESS_MM, Math.round(x * 20) / 20);
  return { min: q(0.75 * half), max: q(1.25 * half) };
}

/** Options of {@link place}: cells to keep clear and a thickness override. */
interface PlaceOptions {
  readonly avoid?: ReadonlySet<string>;
  readonly thicknessMm?: { readonly min: number; readonly max: number };
}

/**
 * Best unclipped ring among `widths` (widest first) that misses `avoid`: the optimiser's best
 * candidate per width at the snapped anchor, ranked by how well its extent matches the source
 * stroke's (|Δwidth| + |Δheight| in mm), then by overlap (IoU, shifts up to a row/bead), ties to
 * the wider one.
 */
function place(
  ctx: PlanContext,
  ring: DetectedRing,
  widths: readonly number[],
  centred: boolean,
  at: Point,
  o: PlaceOptions = {},
): { cells: readonly Coord[]; widthBeads: number } | null {
  const p = ctx.pattern;
  const t = BEAD_TYPES[p.beadType];
  const ref = ctx.source ? strokeCells(ctx, ring, ctx.source) : [];
  const refKeys = new Set(ref.map(cellKey));
  const refExt = ref.length > 0 ? extentMm(ref, t) : null;
  const thicknessMm = o.thicknessMm ?? thicknessOf(ring, ctx);
  let best: { cells: readonly Coord[]; widthBeads: number; miss: number; iou: number } | null =
    null;
  for (const w of widths) {
    if (w < 3) continue;
    const c = ctx.search({
      beadType: p.beadType,
      targetWidthBeads: w,
      thicknessMm,
      ...(centred ? { centres: ON_BEAD_CENTRES } : {}),
    })[0];
    if (!c) continue;
    const anchor = centred ? ringAnchorCentred(p, c, at.y) : ringAnchorFromClick(p, at.x, at.y, c);
    const placed = ringCellsAt(p, c, anchor);
    if (placed.clipped > 0 || placed.cells.some((q) => o.avoid?.has(cellKey(q)))) continue;
    const miss = refExt
      ? Math.abs(c.score.widthMm - refExt.width) + Math.abs(c.score.heightMm - refExt.height)
      : 0;
    const score = iou(placed.cells, refKeys);
    if (!best || miss < best.miss - 1e-9 || (miss < best.miss + 1e-9 && score > best.iou))
      best = { cells: placed.cells, widthBeads: c.score.widthBeads, miss, iou: score };
  }
  return best && { cells: best.cells, widthBeads: best.widthBeads };
}

const concentric = (a: DetectedRing, b: DetectedRing): boolean =>
  Math.hypot(a.cx - b.cx, a.cy - b.cy) <= Math.max(1.5, 0.1 * Math.max(a.w, b.w));

/**
 * Replacement rings for detected strokes (SPEC R37): outer diameter per axis in mm (aspect ≤
 * 1.35, stroke ≤ 1.75 beads), widths `round(min(Dx, Dy)/bw)..round(max(Dx, Dy)/bw)` (≥ 3) with
 * the thickness of the source stroke, the one matching the source stroke best; skipped when
 * both `round(max)` and one bead narrower are clipped (the ring is cut by the lattice edge). Centred on a panel when the centre is within half a bead of
 * the centre line. A ring overlapping an earlier placement retries without overlap (widths ±1,
 * then the thinnest thickness); when that fails its whole concentric group is left unfixed.
 */
export function planRings(rings: readonly DetectedRing[], ctx: PlanContext): RingPlan[] {
  const { fit, pattern } = ctx;
  const bw = BEAD_TYPES[pattern.beadType].widthMm;
  let out: RingPlan[] = [];
  const dropped: DetectedRing[] = [];
  for (const ring of rings) {
    if (dropped.some((d) => concentric(d, ring))) continue;
    const centreMm = toMm(ctx, ring.cx, ring.cy);
    const dx = 2 * ring.rOut * fit.mmPerPx;
    const dy = 2 * ring.rOut * fit.mmPerPxY;
    if (Math.max(dx, dy) > MAX_ASPECT * Math.min(dx, dy)) continue;
    if (ring.w * Math.max(fit.mmPerPx, fit.mmPerPxY) > MAX_STROKE_BEADS * bw) continue;
    const centred =
      pattern.mode === 'panel' && Math.abs(centreMm.x - (pattern.width * bw) / 2) <= bw / 2;
    const lo = Math.round(Math.min(dx, dy) / bw);
    const hi = Math.round(Math.max(dx, dy) / bw);
    const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => b - i);
    const at = (widths: readonly number[], o?: PlaceOptions) =>
      place(ctx, ring, widths, centred, centreMm, o);
    if (!at([hi, hi - 1])) continue;
    let placed = at(span(lo, hi)) ?? at([lo - 1]);
    if (!placed) continue;
    const taken = new Set(out.flatMap((q) => q.cells.map(cellKey)));
    if (placed.cells.some((c) => taken.has(cellKey(c)))) {
      const thin = { min: MIN_THICKNESS_MM, max: MIN_THICKNESS_MM };
      placed =
        at(span(lo - 1, hi + 1), { avoid: taken }) ??
        at(span(lo - 1, hi + 1), { avoid: taken, thicknessMm: thin });
      if (!placed) {
        dropped.push(ring);
        out = out.filter((q) => !concentric(q.ring, ring));
        continue;
      }
    }
    out.push({ ring, ...placed, centreMm });
  }
  return out;
}

/**
 * Erases detected strokes: a pixel with `|d − R_m| ≤ w/2 + 1.5` takes the label and coverage of
 * the pixel at the same angle just outside (`R_out + δ`, when `d ≥ R_m`) or inside (`R_in − δ`)
 * the stroke, `δ = max(1, w/4)`; off-image sources give `−1` and coverage 0.
 */
export function eraseRings(l: LabelImage, rings: readonly DetectedRing[]): LabelImage {
  const labels = Int16Array.from(l.labels);
  const cover = Float32Array.from(l.cover);
  for (const d of rings) {
    const reach = d.w / 2 + 1.5;
    const delta = Math.max(1, d.w / 4);
    const span = d.rM + reach;
    for (let y = Math.max(0, Math.floor(d.cy - span)); y <= Math.min(l.h - 1, d.cy + span); y++)
      for (let x = Math.max(0, Math.floor(d.cx - span)); x <= Math.min(l.w - 1, d.cx + span); x++) {
        const dist = Math.hypot(x - d.cx, y - d.cy);
        if (Math.abs(dist - d.rM) > reach) continue;
        const s = (dist >= d.rM ? d.rOut + delta : d.rIn - delta) / Math.max(dist, 1e-9);
        const sx = Math.round(d.cx + (x - d.cx) * s);
        const sy = Math.round(d.cy + (y - d.cy) * s);
        const p = y * l.w + x;
        const inside = sx >= 0 && sy >= 0 && sx < l.w && sy < l.h;
        labels[p] = inside ? l.labels[sy * l.w + sx]! : -1;
        cover[p] = inside ? l.cover[sy * l.w + sx]! : 0;
      }
  }
  return { labels, cover, w: l.w, h: l.h };
}

/**
 * Paints planned rings into `cells` (in place): each ring bead takes the stroke label of the
 * angle bin of its centre seen from the detected ring centre (no label: left as is). Returns the
 * locked-cell grid and, per plan, the cells painted.
 */
export function paintRings(
  cells: IndexGrid,
  plans: readonly RingPlan[],
  frame: RingFrame,
  beadType: BeadTypeId,
): { locked: boolean[][]; painted: Coord[][] } {
  const locked = cells.map((row) => row.map(() => false));
  const painted = plans.map(({ ring, cells: ringCells }) =>
    ringCells.filter((c) => {
      const p = beadPx(frame, c, beadType);
      const k = strokeLabelAt(ring, Math.atan2(p.y - ring.cy, p.x - ring.cx));
      const i = (c.h - (c.r & 1)) / 2;
      if (k < 0 || !cells[c.r] || i >= cells[c.r]!.length) return false;
      cells[c.r]![i] = k;
      locked[c.r]![i] = true;
      return true;
    }),
  );
  return { locked, painted };
}
