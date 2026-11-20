/**
 * Feasibility warnings (SPEC §3.3, R1, R9). `r` is a 0-based row, `h` a doubled coordinate.
 * - `floating`: unsupported and not connected along its row to a supported bead.
 * - `needsExtraLadder`: unsupported but connected along its row to a supported bead.
 * - `segments`: row has `value` (> 1) separate segments.
 * - `thinLine`: chain of `value` (>= 3) single-bead rows starting at `(r, h)`.
 * - `panelGaps`: panel with an empty cell.
 */
export type Warning =
  | { readonly code: 'floating'; readonly r: number; readonly h: number }
  | { readonly code: 'needsExtraLadder'; readonly r: number; readonly h: number }
  | { readonly code: 'segments'; readonly r: number; readonly value: number }
  | { readonly code: 'thinLine'; readonly r: number; readonly h: number; readonly value: number }
  | { readonly code: 'panelGaps'; readonly r: number; readonly h: number };

/** Warning discriminator. */
export type WarningCode = Warning['code'];
