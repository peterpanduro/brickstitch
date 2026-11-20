import type { ColorId, PaletteEntry, SeedColor } from './types';

type Row = readonly [db: string, sv: string, en: string, hex: string, dyed?: boolean];

/** Research table (2026-11-18); DB-2286 omitted (number unconfirmed). */
const ROWS: readonly Row[] = [
  ['DB-200', 'Vit', 'White', '#F7F7F5', false],
  ['DB-010', 'Svart', 'Black', '#1C1C1C', false],
  ['DB-1139', 'Ljusgrå', 'Ghost grey', '#A7ACB1', false],
  ['DB-723', 'Röd', 'Red', '#D41F1C', false],
  ['DB-726', 'Koboltblå', 'Cobalt', '#0035AD', false],
  ['DB-724', 'Grön', 'Green', '#2F8A30', false],
  ['DB-721', 'Gul', 'Yellow', '#FFCE00', false],
  ['DB-722', 'Orange', 'Orange', '#FE5B12', false],
  ['DB-1132', 'Ljusgul', 'Canary yellow', '#F4C201', false],
  ['DB-2274', 'Persikorange', 'Persimmon', '#E17744'],
  ['DB-2291', 'Mörkgrön', 'Matte avocado', '#515F48'],
  ['DB-734', 'Mörkbrun', 'Chocolate brown', '#452520', false],
  ['DB-2105', 'Beige', 'Beige (dyed)', '#7A634F', true],
  ['DB-882', 'Grå', 'Light grey matte AB', '#717879', false],
  ['DB-1589', 'Matt ljusgrå', 'Matte ghost grey', '#82838A', false],
  ['DB-307', 'Mörkgrå', 'Matte silver grey', '#544F4B', false],
  ['DB-321', 'Silvergrå', 'Matte silver', '#736D65', false],
  ['DB-310', 'Matt svart', 'Matte black', '#282828', false],
  ['DB-351', 'Matt vit', 'Matte white', '#EEEEEC', false],
  ['DB-352', 'Beige', 'Matte cream', '#E8D6C0', false],
  ['DB-732', 'Gräddvit', 'Cream', '#EEE3C2', false],
  ['DB-208', 'Hudton', 'Tan', '#BE9978', false],
  ['DB-1134', 'Mörkbrun', 'Currant brown', '#371B15', false],
  ['DB-1585', 'Avokadogrön', 'Matte avocado green', '#475D33', false],
  ['DB-797', 'Olivgrön', 'Olive green', '#304F29', false],
  ['DB-1135', 'Olivgrön', 'Avocado green', '#505E2F', false],
  ['DB-163', 'Grön AB', 'Green AB', '#468742', false],
  ['DB-164', 'Ljusblå', 'Light blue AB', '#43AAD0', false],
  ['DB-166', 'Turkos', 'Turquoise AB', '#2CA398', false],
  ['DB-165', 'Blå', 'Royal blue AB', '#4436A0', false],
  ['DB-1588', 'Matt blå', 'Matte cyan blue', '#3B47D5', false],
  ['DB-1137', 'Ljus gråblå', 'Agate blue', '#98AAE2', false],
  ['DB-376', 'Gråblå', 'Matte grey blue', '#3C566A', false],
  ['DB-135', 'Lila', 'Midnight purple', '#2C2D64'],
  ['DB-435', 'Rosa', 'Pink blush', '#C27D7B'],
  ['DB-1335', 'Ljusrosa', 'Light pink', '#F19BAB'],
  ['DB-331', 'Guld', 'Matte gold', '#B68745', false],
  ['DB-1833', 'Gulguld', 'Yellow gold', '#C17D25'],
  ['DB-1851', 'Tenn', 'Smoky pewter', '#959078'],
  ['DB-254', 'Mörk silver', 'Tarnished silver', '#5B5246'],
];

/**
 * Built-in Miyuki Delica 11/0 colours. Hex values are approximate photo samples; `dyed` is
 * `true`/`false` where known, unset where unknown.
 */
export const SEED_CATALOG: readonly SeedColor[] = ROWS.map(([db, sv, en, hex, dyed]) => ({
  db,
  names: { sv, en },
  hex,
  approximate: true,
  ...(dyed !== undefined && { dyed }),
}));

/** Seed colour with Delica number `db`, if catalogued. */
export const seedByDb = (
  db: string,
  catalog: readonly SeedColor[] = SEED_CATALOG,
): SeedColor | undefined => catalog.find((s) => s.db === db);

/** Creates a palette entry from a seed colour; `name` stays unset (user override only). */
export function paletteEntryFromSeed(seed: SeedColor, id: ColorId): PaletteEntry {
  return {
    id,
    db: seed.db,
    ...(seed.finish !== undefined && { finish: seed.finish }),
    hex: seed.hex,
    approximate: true,
  };
}
