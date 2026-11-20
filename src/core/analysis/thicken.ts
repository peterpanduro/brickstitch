import { createMask } from '../imaging/mask';
import { thickenSkeleton } from '../imaging/thicken';
import type { Mask } from '../imaging/types';
import type { LabelImage } from './label';

const maskWhere = (
  labels: Int16Array,
  w: number,
  h: number,
  test: (k: number) => boolean,
): Mask => {
  const m = createMask(w, h);
  for (let p = 0; p < labels.length; p++) m.data[p] = test(labels[p]!) ? 1 : 0;
  return m;
};

/** Gives every unlabelled pixel set in `grow` the label of the nearest labelled pixel (4-BFS). */
function propagate(labels: Int16Array, w: number, grow: Mask): void {
  let front: number[] = [];
  for (let p = 0; p < labels.length; p++) if (labels[p]! >= 0) front.push(p);
  while (front.length > 0) {
    const next: number[] = [];
    for (const p of front) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= labels.length || !grow.data[q] || labels[q]! >= 0) continue;
        labels[q] = labels[p]!;
        next.push(q);
      }
    }
    front = next;
  }
}

/**
 * Line thickening (D5, `sol2/thick.py`): widens the silhouette and then each detail colour's
 * mask to at least `minWidthPx` via skeleton + EDT. New silhouette pixels take the nearest
 * existing colour and full coverage; grown detail pixels take the detail colour.
 * @param detail detail flag per colour index
 */
export function thickenLabels(
  l: LabelImage,
  minWidthPx: number,
  detail: readonly boolean[],
): LabelImage {
  if (minWidthPx <= 1) return l;
  const { labels, w, h } = l;
  const out = Int16Array.from(labels);
  propagate(
    out,
    w,
    thickenSkeleton(
      maskWhere(labels, w, h, (k) => k >= 0),
      minWidthPx,
    ),
  );
  const present = new Set(labels);
  detail.forEach((d, k) => {
    if (!d || !present.has(k)) return;
    const grown = thickenSkeleton(
      maskWhere(labels, w, h, (x) => x === k),
      minWidthPx,
    );
    for (let p = 0; p < out.length; p++) if (grown.data[p]) out[p] = k;
  });
  const cover = Float32Array.from(l.cover);
  for (let p = 0; p < out.length; p++) if (labels[p]! < 0 && out[p]! >= 0) cover[p] = 1;
  return { labels: out, cover, w, h };
}
