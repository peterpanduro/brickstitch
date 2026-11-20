/** 8-bit sRGB triple; the one RGB type in core (tuples are cheap in hot pixel loops). */
export type RgbTuple = readonly [number, number, number];

/** CIE L*a*b* colour (D65). */
export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

/** Identifier of a palette entry, unique within a pattern. */
export type ColorId = string;

/**
 * A colour in a pattern palette. The row-list label is `name` if set, else the `db` number;
 * seed names are resolved from `db` and locale at render time.
 */
export interface PaletteEntry {
  readonly id: ColorId;
  /** User override of the display name. */
  readonly name?: string;
  /** Miyuki Delica catalogue number, e.g. `DB-200`. */
  readonly db?: string;
  readonly finish?: string;
  /** `#rrggbb`. */
  readonly hex: string;
  readonly approximate?: boolean;
  /** Detail colour: wins over majority colours when sampled (SPEC §5.4). */
  readonly detail?: boolean;
}

/** Built-in catalogue colour; names are resolved per locale. */
export interface SeedColor {
  readonly db: string;
  readonly names: { readonly sv: string; readonly en: string };
  readonly finish?: string;
  readonly hex: string;
  readonly approximate: true;
  /** Dyed finish that may fade. */
  readonly dyed?: boolean;
}
