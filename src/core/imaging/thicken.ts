import { edt } from './edt';
import { createMask, invert, union } from './mask';
import { zhangSuen } from './thin';
import type { Mask } from './types';

/** `mask` grown by one pixel to the right (each run one pixel longer). */
export function widenRight(mask: Mask): Mask {
  const out = createMask(mask.width, mask.height);
  for (let p = 0; p < out.data.length; p++)
    out.data[p] = mask.data[p]! | (p % mask.width > 0 ? mask.data[p - 1]! : 0);
  return out;
}

/** Squared distance from the plain skeleton beyond which a widened-skeleton pixel is missing. */
const GAP2 = 4;

/** Size of each 8-connected component of set pixels, per pixel (0 where unset). */
function componentSizes(m: Uint8Array, w: number): Int32Array {
  const size = new Int32Array(m.length);
  const seen = new Uint8Array(m.length);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let i = 0; i < comp.length; i++) {
      const p = comp[i]!;
      const x = p % w;
      for (let dy = -w; dy <= w; dy += w)
        for (let dx = -1; dx <= 1; dx++) {
          const q = p + dy + dx;
          if (q < 0 || q >= m.length || x + dx < 0 || x + dx >= w || !m[q] || seen[q]) continue;
          seen[q] = 1;
          comp.push(q);
        }
    }
    for (const p of comp) size[p] = comp.length;
  }
  return size;
}

/** The mask-only parts of {@link strokeSkeleton}, reusable for any `minWidthPx`. */
export interface SkeletonParts {
  readonly mask: Mask;
  /** Zhang–Suen skeleton of `mask`. */
  readonly plain: Mask;
  /** Squared distance to `plain`. */
  readonly near: Float32Array;
  /** Zhang–Suen skeleton of `mask` widened one pixel to the right. */
  readonly wide: Mask;
  /** Squared distance to the outside of `mask` (computed on first call). */
  bg(): Float32Array;
}

/** Computes the {@link SkeletonParts} of `mask`. */
export function skeletonParts(mask: Mask): SkeletonParts {
  const plain = zhangSuen(mask);
  let bg: Float32Array | undefined;
  return {
    mask,
    plain,
    near: edt(plain),
    wide: zhangSuen(widenRight(mask)),
    bg: () => (bg ??= edt(invert(mask))),
  };
}

/** {@link strokeSkeleton} from precomputed parts; `parts.plain` itself when nothing is added. */
export function skeletonFromParts(parts: SkeletonParts, minWidthPx: number): Mask {
  const { mask, plain, near, wide } = parts;
  const cand = new Uint8Array(mask.data.length);
  let any = false;
  for (let p = 0; p < cand.length; p++)
    if (wide.data[p] && mask.data[p] && near[p]! > GAP2) {
      cand[p] = 1;
      any = true;
    }
  if (!any) return plain;
  const bg = parts.bg();
  for (let p = 0; p < cand.length; p++)
    if (cand[p] && 2 * Math.sqrt(bg[p]!) - 1 >= minWidthPx) cand[p] = 0;
  const size = componentSizes(cand, mask.width);
  const minRun = Math.max(3, Math.ceil(minWidthPx / 2));
  const skel = createMask(mask.width, mask.height);
  let extra = false;
  for (let p = 0; p < cand.length; p++) {
    const add = cand[p] === 1 && size[p]! >= minRun;
    skel.data[p] = plain.data[p]! | (add ? 1 : 0);
    if (add) extra = true;
  }
  return extra ? skel : plain;
}

/** {@link strokeSkeleton} and the squared distance of every pixel to it. */
function skeletonWithDistance(mask: Mask, minWidthPx: number): { skel: Mask; d2: Float32Array } {
  const parts = skeletonParts(mask);
  const skel = skeletonFromParts(parts, minWidthPx);
  return { skel, d2: skel === parts.plain ? parts.near : edt(skel) };
}

/**
 * Centre lines for thickening (R40): the Zhang–Suen skeleton of `mask`, plus — where it has no
 * pixel within 2 px — runs of the Zhang–Suen skeleton of `mask` widened by one pixel to the right
 * that lie in strokes thinner than `minWidthPx` (local width `2·d − 1`, d = distance to the
 * outside) and are at least `max(3, minWidthPx / 2)` px long. Zhang–Suen erases diagonal
 * staircases with an even number of pixels per row (2, 4, …) from their ends; the widened copy has
 * the other parity, so it keeps them. Elsewhere the result equals the plain skeleton.
 */
export const strokeSkeleton = (mask: Mask, minWidthPx: number): Mask =>
  skeletonWithDistance(mask, minWidthPx).skel;

/**
 * Widens thin strokes: `mask ∪ {p : dist(p, strokeSkeleton(mask, minWidthPx)) <= minWidthPx / 2}`.
 * Where Zhang–Suen finds a centre line this equals growing around it alone.
 */
export function thickenSkeleton(mask: Mask, minWidthPx: number): Mask {
  const { d2 } = skeletonWithDistance(mask, minWidthPx);
  const r2 = (minWidthPx / 2) ** 2;
  const grown = createMask(mask.width, mask.height);
  for (let i = 0; i < d2.length; i++) grown.data[i] = d2[i]! <= r2 ? 1 : 0;
  return union(mask, grown);
}
