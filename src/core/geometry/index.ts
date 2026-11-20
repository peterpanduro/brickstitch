/** Bead type identifiers. */
export type BeadTypeId = 'delica11' | 'delica15';

/** Physical bead dimensions: width along the row, row pitch between rows. */
export interface BeadType {
  readonly id: BeadTypeId;
  readonly widthMm: number;
  readonly rowPitchMm: number;
}

/** Lattice coordinate in doubled units; `h - r` is always even. */
export interface Coord {
  readonly r: number;
  readonly h: number;
}

/** Supported bead types. */
export const BEAD_TYPES: Readonly<Record<BeadTypeId, BeadType>> = {
  delica11: { id: 'delica11', widthMm: 1.6, rowPitchMm: 1.3 },
  delica15: { id: 'delica15', widthMm: 1.3, rowPitchMm: 1.15 },
};

/** Number of beads in row `r` of a lattice with `W` beads in wide rows. */
export const rowLength = (W: number, r: number): number => (r % 2 === 0 ? W : W - 1);

/** Doubled horizontal coordinate of bead index `i` in row `r`. */
export const hOf = (r: number, i: number): number => 2 * i + (r & 1);

/** Bead index of doubled coordinate `h` in row `r`. */
export const iOf = (r: number, h: number): number => (h - (r & 1)) / 2;

/** The six lattice neighbours: left, right, then the row above and below. */
export const neighbours = ({ r, h }: Coord): Coord[] => [
  { r, h: h - 2 },
  { r, h: h + 2 },
  { r: r - 1, h: h - 1 },
  { r: r - 1, h: h + 1 },
  { r: r + 1, h: h - 1 },
  { r: r + 1, h: h + 1 },
];

/** Bead centre in millimetres. */
export const centreMm = ({ r, h }: Coord, t: BeadType): { x: number; y: number } => ({
  x: (h * t.widthMm) / 2,
  y: r * t.rowPitchMm,
});

/** Bounding size in millimetres of a set of beads (SPEC §2.3). */
export function extentMm(coords: readonly Coord[], t: BeadType): { width: number; height: number } {
  const hs = coords.map((c) => c.h);
  const rs = coords.map((c) => c.r);
  const cols = (Math.max(...hs) - Math.min(...hs)) / 2 + 1;
  const rows = Math.max(...rs) - Math.min(...rs) + 1;
  return { width: cols * t.widthMm, height: rows * t.rowPitchMm };
}
