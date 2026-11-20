import type { MessageKey, PatternMode } from '../../core';

/** Size preset ids, smallest first ("Egen" is the absence of a match). */
export const SIZE_PRESET_IDS = ['small', 'medium', 'large'] as const;

/** Size preset id. */
export type SizePresetId = (typeof SIZE_PRESET_IDS)[number];

/** Canvas size preset "Liten / Mellan / Stor" (SPEC R52.8). */
export interface SizePreset {
  readonly id: SizePresetId;
  readonly width: number;
  readonly height: number;
  readonly labelKey: MessageKey;
}

const SIZES: Readonly<Record<PatternMode, readonly (readonly [number, number])[]>> = {
  panel: [
    [9, 18],
    [11, 22],
    [15, 30],
  ],
  shaped: [
    [15, 22],
    [20, 28],
    [26, 36],
  ],
};

/** Size presets for `mode`; Mellan equals `defaultSize(mode)`. */
export const sizePresets = (mode: PatternMode): SizePreset[] =>
  SIZE_PRESET_IDS.map((id, i) => {
    const [width, height] = SIZES[mode][i] as readonly [number, number];
    return { id, width, height, labelKey: `size.preset.${id}` };
  });

/** Import detail preset Enkel / Lagom / Detaljerad (SPEC R52.7). */
export interface DetailPreset {
  readonly id: 'simple' | 'balanced' | 'detailed';
  readonly lineSensitivity: number;
  readonly details: number;
}

/** Detail presets in display order. */
export const DETAIL_PRESETS: readonly DetailPreset[] = [
  { id: 'simple', lineSensitivity: 0.3, details: 0 },
  { id: 'balanced', lineSensitivity: 0.5, details: 0.25 },
  { id: 'detailed', lineSensitivity: 0.8, details: 0.75 },
];

const EPS = 1e-9;

/**
 * Id of the preset whose numeric values all equal those of `current` (within 1e-9); `null`
 * when none does (e.g. after a manual change). Non-numeric preset fields are ignored.
 */
export function matchingPreset<P extends { readonly id: string }>(
  presets: readonly P[],
  current: object,
): P['id'] | null {
  const cur = current as Record<string, unknown>;
  const hit = presets.find((p) =>
    Object.entries(p).every(
      ([k, v]) =>
        typeof v !== 'number' || (typeof cur[k] === 'number' && Math.abs(cur[k] - v) < EPS),
    ),
  );
  return hit?.id ?? null;
}
