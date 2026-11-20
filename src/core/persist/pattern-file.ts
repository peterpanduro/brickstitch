import { rowLength } from '../geometry';
import type { BeadTypeId } from '../geometry';
import type { PaletteEntry } from '../palette/types';
import type { LadderChoice, Pattern } from '../pattern/types';
import { CURRENT_VERSION, type PatternFile } from './types';

/** Why a pattern file was rejected. */
export type ParseError =
  'json' | 'format' | 'version' | 'size' | 'mode' | 'beadType' | 'palette' | 'cells' | 'color';

/** Result of {@link parsePatternFile}. */
export type ParseResult = { ok: true; pattern: Pattern } | { ok: false; error: ParseError };

/** Serialises a pattern to `.brickstitch.json` text. */
export function serialise(p: Pattern, appVersion: string, now: Date): string {
  const file: PatternFile = {
    format: 'brickstitch-pattern',
    version: CURRENT_VERSION,
    savedAt: now.toISOString(),
    app: `brickstitch@${appVersion}`,
    pattern: p,
  };
  return JSON.stringify(file, null, 2);
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number =>
  Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const HEX = /^#[0-9a-fA-F]{6}$/;
const BEADS: readonly BeadTypeId[] = ['delica11', 'delica15'];
const OPTIONAL = {
  name: 'string',
  db: 'string',
  finish: 'string',
  approximate: 'boolean',
  detail: 'boolean',
} as const;

function paletteEntry(e: unknown): PaletteEntry | null {
  if (!isObj(e) || typeof e.id !== 'string' || e.id === '') return null;
  if (typeof e.hex !== 'string' || !HEX.test(e.hex)) return null;
  const out: Record<string, unknown> = { id: e.id, hex: e.hex };
  for (const [k, type] of Object.entries(OPTIONAL)) {
    if (e[k] === undefined) continue;
    if (typeof e[k] !== type) return null;
    out[k] = e[k];
  }
  return out as unknown as PaletteEntry;
}

function palette(pal: unknown): PaletteEntry[] | null {
  if (!Array.isArray(pal)) return null;
  const out = pal.map(paletteEntry);
  const ids = new Set(out.map((e) => e?.id));
  return out.every((e) => e !== null) && ids.size === out.length ? out : null;
}

function ladder(l: unknown, height: number): LadderChoice | null {
  if (!isObj(l)) return null;
  if (l.kind === 'auto') return { kind: 'auto' };
  return l.kind === 'manual' && isInt(l.row, 0, height - 1) ? { kind: 'manual', row: l.row } : null;
}

function cells(
  raw: unknown,
  width: number,
  height: number,
  ids: ReadonlySet<string>,
): Pattern['cells'] | ParseError {
  if (!Array.isArray(raw) || raw.length !== height) return 'cells';
  for (const [r, row] of (raw as unknown[]).entries()) {
    if (!Array.isArray(row) || row.length !== rowLength(width, r)) return 'cells';
    for (const c of row as unknown[]) {
      if (c !== null && (typeof c !== 'string' || !ids.has(c))) return 'color';
    }
  }
  return (raw as (string | null)[][]).map((row) => [...row]);
}

/**
 * Validates and parses `.brickstitch.json` text; the pattern is rebuilt from validated fields
 * only. Panels may contain `null` cells (`panelGaps` is a warning, SPEC §2.3). Never throws.
 */
export function parsePatternFile(json: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return { ok: false, error: 'json' };
  }
  const fail = (error: ParseError): ParseResult => ({ ok: false, error });
  if (!isObj(doc) || doc.format !== 'brickstitch-pattern') return fail('format');
  if (!isInt(doc.version, 1, Number.MAX_SAFE_INTEGER) || doc.version > CURRENT_VERSION) {
    return fail('version');
  }
  const p = doc.pattern;
  if (!isObj(p)) return fail('format');
  const { width, height, mode, beadType, title, description } = p;
  if (!isInt(width, 2, 80) || !isInt(height, 1, 120)) return fail('size');
  if (mode !== 'panel' && mode !== 'shaped') return fail('mode');
  if (!BEADS.includes(beadType as BeadTypeId)) return fail('beadType');
  if (typeof title !== 'string' || typeof description !== 'string') return fail('format');
  const pal = palette(p.palette);
  if (!pal) return fail('palette');
  const lad = ladder(p.ladder, height);
  if (!lad) return fail('format');
  const grid = cells(p.cells, width, height, new Set(pal.map((e) => e.id)));
  if (typeof grid === 'string') return fail(grid);
  return {
    ok: true,
    pattern: {
      title,
      description,
      beadType: beadType as BeadTypeId,
      mode,
      width,
      height,
      palette: pal,
      cells: grid,
      ladder: lad,
    },
  };
}
