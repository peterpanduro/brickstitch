import {
  addPaletteEntry,
  colourLabel,
  SEED_CATALOG,
  seedName,
  type ColorId,
  type KeyValueStore,
  type Locale,
  type PaletteEntry,
  type Pattern,
} from '../../core';
import { colourFamily, type ColourFamily } from './colour-family';

/** localStorage key of the user palette library (SPEC §9). */
export const LIBRARY_KEY = 'bs:v1:palette';

/** A palette entry without its pattern-local id. */
export type ColorSpec = Omit<PaletteEntry, 'id'>;

/** Smallest unused id of the form `c<n>`. */
export function nextColorId(p: Pattern): ColorId {
  const ids = new Set(p.palette.map((e) => e.id));
  let n = 1;
  while (ids.has(`c${n}`)) n++;
  return `c${n}`;
}

/** Adds `spec` to the pattern palette, reusing an entry with the same DB number. */
export function addColor(p: Pattern, spec: ColorSpec): { pattern: Pattern; id: ColorId } {
  const existing = spec.db ? p.palette.find((e) => e.db === spec.db) : undefined;
  if (existing) return { pattern: p, id: existing.id };
  const id = nextColorId(p);
  return { pattern: addPaletteEntry(p, { id, ...spec }), id };
}

/** One row of the add-colour picker. */
export interface ColorChoice {
  readonly key: string;
  readonly label: string;
  readonly db?: string;
  readonly hex: string;
  readonly spec: ColorSpec;
  readonly source: 'library' | 'seed';
  readonly family: ColourFamily;
}

const toSpec = (e: PaletteEntry): ColorSpec =>
  Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'id')) as ColorSpec;

/**
 * Library entries then seed colours, filtered by family and by label or DB number
 * (case-insensitive).
 */
export function colorChoices(
  query: string,
  locale: Locale,
  library: readonly PaletteEntry[],
  family: ColourFamily | 'all' = 'all',
): ColorChoice[] {
  const q = query.trim().toLowerCase();
  const all: ColorChoice[] = [
    ...library.map((e): ColorChoice => ({
      key: `lib:${e.id}`,
      label: colourLabel(e, locale),
      ...(e.db !== undefined && { db: e.db }),
      hex: e.hex,
      spec: toSpec(e),
      source: 'library',
      family: colourFamily(e.hex),
    })),
    ...SEED_CATALOG.map((s): ColorChoice => ({
      key: `seed:${s.db}`,
      label: s.names[locale],
      db: s.db,
      hex: s.hex,
      spec: { db: s.db, hex: s.hex, approximate: true, ...(s.finish && { finish: s.finish }) },
      source: 'seed',
      family: colourFamily(s.hex),
    })),
  ];
  const byFamily = family === 'all' ? all : all.filter((c) => c.family === family);
  return q
    ? byFamily.filter((c) => `${c.label} ${c.db ?? ''}`.toLowerCase().includes(q))
    : byFamily;
}

/** Texts of a palette row: name line and optional DB line (SPEC R47). */
export interface RowLabels {
  readonly name: string;
  readonly db?: string;
  readonly approximate: boolean;
}

/** Name first (user name, localised seed name, DB number, hex), DB number second if distinct. */
export function paletteRowLabels(entry: PaletteEntry, locale: Locale): RowLabels {
  const name =
    entry.name ?? (entry.db ? seedName(entry.db, locale) : undefined) ?? colourLabel(entry, locale);
  return {
    name,
    ...(entry.db !== undefined && entry.db !== name && { db: entry.db }),
    approximate: entry.approximate === true,
  };
}

/** Top of a popover anchored at `anchor`, kept between the top bar and the viewport bottom. */
export function popoverTop(anchor: number, height: number, viewport: number): number {
  return Math.max(72, Math.min(anchor, viewport - height - 16));
}

const isEntry = (e: unknown): e is PaletteEntry =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as PaletteEntry).id === 'string' &&
  typeof (e as PaletteEntry).hex === 'string' &&
  /^#[0-9a-f]{6}$/i.test((e as PaletteEntry).hex);

/** Reads the user library; missing or invalid data yields `[]`. */
export function loadLibrary(store: KeyValueStore): PaletteEntry[] {
  try {
    const v: unknown = JSON.parse(store.get(LIBRARY_KEY) ?? '[]');
    return Array.isArray(v) && v.every(isEntry) ? v : [];
  } catch {
    return [];
  }
}

/** Writes the user library; never throws. */
export function saveLibrary(
  store: KeyValueStore,
  lib: readonly PaletteEntry[],
): { ok: true } | { ok: false; error: string } {
  try {
    store.set(LIBRARY_KEY, JSON.stringify(lib));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Inserts or replaces `e` (matched by DB number, else by id). */
export function upsertLibrary(lib: readonly PaletteEntry[], e: PaletteEntry): PaletteEntry[] {
  const same = (x: PaletteEntry) => (e.db ? x.db === e.db : x.id === e.id);
  return lib.some(same) ? lib.map((x) => (same(x) ? e : x)) : [...lib, e];
}

/** `#rrggbb` (lower case) from `#rrggbb` or `rrggbb`; `null` when invalid. */
export function normalizeHex(v: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${(m[1] as string).toLowerCase()}` : null;
}

/**
 * Next cell of a `len`-item grid of `cols` columns for arrows (stays at an edge), Home and End; `null`
 * for other keys or an empty grid.
 */
export function gridIndex(len: number, current: number, cols: number, key: string): number | null {
  if (len === 0) return null;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
  if (step !== undefined) {
    const next = current + step;
    return next >= 0 && next < len ? next : current;
  }
  if (key === 'Home') return 0;
  return key === 'End' ? len - 1 : null;
}

/** Select-option text: row name, plus the DB number when distinct (names can repeat). */
export function paletteOptionLabel(entry: PaletteEntry, locale: Locale): string {
  const { name, db } = paletteRowLabels(entry, locale);
  return db ? `${name} · ${db}` : name;
}
