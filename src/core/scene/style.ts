import type { BeadMark } from './types';

/**
 * Shared scene style; every colour is opaque `#rrggbb` and every width is in millimetres, so
 * SVG and PDF (jsPDF standard fonts, no alpha) render alike.
 */
export const SCENE_STYLE = {
  text: '#333333',
  alert: '#c62828',
  alertText: '#ffffff',
  ladderTint: '#fff1c2',
  ladderText: '#8a6100',
  loop: '#555555',
  slot: '#d5d9de',
  slotSlash: '#c4c9cf',
  beadStroke: '#8c8c8c',
  unknownFill: '#888888',
  fontFamily: 'Helvetica, Arial, sans-serif',
  ladderFontWeight: 'bold',
  stroke: {
    bead: 0.05,
    slot: 0.06,
    slotSlash: 0.06,
    mark: 0.22,
    hatch: 0.18,
    loop: 0.12,
    line: 0.1,
    marker: 0.12,
  },
} as const;

/** Outline colour, dash and hatch per bead mark (SPEC §3.5: unsupported red, thin orange). */
export const MARK_STYLE: Readonly<
  Record<BeadMark, { readonly stroke: string; readonly dash?: string; readonly hatch?: boolean }>
> = {
  floating: { stroke: '#d32f2f', hatch: true },
  extraLadder: { stroke: '#d32f2f', dash: '0.3 0.2' },
  thin: { stroke: '#ef6c00' },
};

/** Inset of the empty-cell slash as a fraction of the slot size on each side. */
export const SLOT_SLASH_INSET = 0.22;

/** Corner radius of a bead rect as a fraction of its smaller side. */
export const BEAD_ROUNDING = 0.28;

/** Corner radius of a glossy editor bead as a fraction of its height (SPEC R45; PDF unchanged). */
export const EDITOR_BEAD_ROUNDING = 0.18;
