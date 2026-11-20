import type { Locale } from '../i18n/types';
import { SEED_CATALOG, seedByDb } from './catalog';
import type { PaletteEntry, SeedColor } from './types';

/** Localised seed name for Delica number `db`, if catalogued. */
export const seedName = (
  db: string,
  locale: Locale,
  catalog: readonly SeedColor[] = SEED_CATALOG,
): string | undefined => seedByDb(db, catalog)?.names[locale];

/**
 * Display label (SPEC D2, R11): user `name`, else `db`, else the localised seed name whose hex
 * matches, else hex.
 */
export function colourLabel(
  entry: PaletteEntry,
  locale: Locale,
  catalog: readonly SeedColor[] = SEED_CATALOG,
): string {
  if (entry.name) return entry.name;
  if (entry.db) return entry.db;
  const hex = entry.hex.toLowerCase();
  return catalog.find((s) => s.hex.toLowerCase() === hex)?.names[locale] ?? entry.hex;
}
