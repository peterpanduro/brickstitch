import { hOf } from '../geometry';
import { allRows } from '../pattern/rows';
import type { Pattern } from '../pattern/types';
import {
  BEAD_STATUS,
  beadStatus,
  supportIndices,
  supportedMask,
  towardLadder,
  type CellMask,
} from './support';
import type { Warning } from './types';

const MIN_THIN_CHAIN = 3;

const isLone = (row: readonly unknown[], i: number): boolean =>
  row[i - 1] == null && row[i + 1] == null;

/** Off-ladder single-bead segments with exactly one supported support (SPEC R9). */
function thinMask(p: Pattern, ladderRow: number, sup: CellMask): CellMask {
  return p.cells.map((row, r) => {
    const out = new Uint8Array(row.length);
    const from = sup[towardLadder(r, ladderRow)];
    if (r === ladderRow || !from) return out;
    row.forEach((c, i) => {
      const [a, b] = supportIndices(r, i);
      out[i] = c !== null && isLone(row, i) && (from[a] ?? 0) + (from[b] ?? 0) === 1 ? 1 : 0;
    });
    return out;
  });
}

function thinLines(p: Pattern, ladderRow: number, sup: CellMask): Warning[] {
  const thin = thinMask(p, ladderRow, sup);
  const out: Warning[] = [];
  thin.forEach((row, r) =>
    row.forEach((v, i) => {
      const parent = thin[towardLadder(r, ladderRow)];
      const [a, b] = supportIndices(r, i);
      if (!v || parent?.[a] || parent?.[b]) return;
      let length = 1;
      for (let n = r, j = i; ; length++) {
        const next = n < ladderRow ? n - 1 : n + 1;
        const k = j - (next & 1);
        const t = thin[next];
        if (t?.[k]) j = k;
        else if (t?.[k + 1]) j = k + 1;
        else break;
        n = next;
      }
      if (length >= MIN_THIN_CHAIN) out.push({ code: 'thinLine', r, h: hOf(r, i), value: length });
    }),
  );
  return out;
}

function beadWarnings(status: CellMask): Warning[] {
  const out: Warning[] = [];
  status.forEach((row, r) =>
    row.forEach((s, i) => {
      const h = hOf(r, i);
      if (s === BEAD_STATUS.extraLadder) out.push({ code: 'needsExtraLadder', r, h });
      if (s === BEAD_STATUS.floating) out.push({ code: 'floating', r, h });
    }),
  );
  return out;
}

function panelGaps(p: Pattern): Warning[] {
  if (p.mode !== 'panel') return [];
  return p.cells.flatMap((row, r) =>
    row.flatMap((c, i): Warning[] => (c === null ? [{ code: 'panelGaps', r, h: hOf(r, i) }] : [])),
  );
}

/**
 * Feasibility warnings for a ladder row (SPEC §3.3, R1, R9), grouped as bead warnings
 * (`floating`/`needsExtraLadder`, row-major), `segments`, `thinLine`, then `panelGaps`.
 * Precomputed masks for the same `ladderRow` may be passed to avoid recomputation.
 */
export function warnings(
  p: Pattern,
  ladderRow: number,
  supported: CellMask = supportedMask(p, ladderRow),
  status: CellMask = beadStatus(p, ladderRow, supported),
): Warning[] {
  const segments = allRows(p).flatMap((x): Warning[] =>
    x.segments.length > 1 ? [{ code: 'segments', r: x.r, value: x.segments.length }] : [],
  );
  return [
    ...beadWarnings(status),
    ...segments,
    ...thinLines(p, ladderRow, supported),
    ...panelGaps(p),
  ];
}
