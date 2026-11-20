import type { KeyValueStore } from '../../core';
import { VIEW_PAD, type Insets } from './zoom';

/** Editor layout by viewport width (SPEC R46, R51). */
export type Layout = 'desktop' | 'tablet' | 'phone';

/** Desktop ≥ 1024 px, tablet 600–1023 px, phone < 600 px. */
export const layoutFor = (width: number): Layout =>
  width >= 1024 ? 'desktop' : width >= 600 ? 'tablet' : 'phone';

/** Long press on a dock swatch that opens its entry editor (R51 phone). */
export const LONG_PRESS_MS = 500;

const PAD: Readonly<Record<Layout, Insets>> = {
  desktop: VIEW_PAD,
  tablet: { top: 72, right: 150, bottom: 88, left: 136 },
  phone: { top: 64, right: 12, bottom: 16, left: 12 },
};

/**
 * Base canvas viewport padding per layout: desktop {@link VIEW_PAD}; tablet keeps room for the
 * chip, the start pill, the compact real-size card, the hint and the zoom stack; phone only for
 * the chip row (the start row has its own chip there).
 */
export const touchViewPad = (l: Layout): Insets => PAD[l];

/** localStorage key remembering that the touch hint was dismissed. */
export const HINT_KEY = 'bs:v1:touchHint';

/** Whether the first-use touch hint was dismissed before; storage errors count as "not seen". */
export function hintSeen(store: KeyValueStore): boolean {
  try {
    return store.get(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembers the dismissed hint (a convenience: storage errors are ignored). */
export function markHintSeen(store: KeyValueStore): void {
  try {
    store.set(HINT_KEY, '1');
  } catch {
    return;
  }
}
