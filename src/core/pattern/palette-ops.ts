import type { ColorId, PaletteEntry } from '../palette/types';
import type { Pattern } from './types';

const hasColor = (p: Pattern, id: ColorId): boolean => p.palette.some((e) => e.id === id);

/** Appends a palette entry; throws if the id already exists. */
export function addPaletteEntry(p: Pattern, entry: PaletteEntry): Pattern {
  if (hasColor(p, entry.id)) throw new Error(`duplicate colour id ${entry.id}`);
  return { ...p, palette: [...p.palette, entry] };
}

/** Merges `changes` into the entry `id` (the id itself is immutable). */
export function updatePaletteEntry(
  p: Pattern,
  id: ColorId,
  changes: Partial<Omit<PaletteEntry, 'id'>>,
): Pattern {
  if (!hasColor(p, id)) throw new Error(`unknown colour id ${id}`);
  return { ...p, palette: p.palette.map((e) => (e.id === id ? { ...e, ...changes, id } : e)) };
}

/**
 * Removes entry `id`. If cells use it, `replacement` (another palette id) is required and
 * substituted; otherwise throws.
 */
export function removePaletteEntry(p: Pattern, id: ColorId, replacement?: ColorId): Pattern {
  const inUse = p.cells.some((row) => row.includes(id));
  if (!inUse) return { ...p, palette: p.palette.filter((e) => e.id !== id) };
  if (replacement === undefined || replacement === id || !hasColor(p, replacement)) {
    throw new Error(`colour ${id} is in use and needs a valid replacement`);
  }
  return {
    ...p,
    palette: p.palette.filter((e) => e.id !== id),
    cells: p.cells.map((row) => row.map((c) => (c === id ? replacement : c))),
  };
}
