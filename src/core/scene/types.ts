import type { ColorId, PaletteEntry } from '../palette/types';

/** Feasibility mark on a bead (SPEC §3.5). */
export type BeadMark = 'floating' | 'extraLadder' | 'thin';

/** Semantic role of a text, rect or circle; renderers may style by it. */
export type ShapeRole = 'rowNumber' | 'count' | 'ladder' | 'loop' | 'label';

/** Right-gutter symbol drawn by the renderer: `alert` (unsupported beads), `segments` (split row). */
export type MarkerKind = 'alert' | 'segments';

/**
 * Drawing primitive in millimetres; rendered by SVG (editor) and PDF alike. Positions are
 * scene coordinates (top-left origin). `bead`/`slot` carry their lattice coordinate `(r, h)`
 * and their top-left corner; renderers round their corners.
 */
export type Shape =
  | {
      readonly t: 'bead';
      readonly r: number;
      readonly h: number;
      readonly xMm: number;
      readonly yMm: number;
      readonly wMm: number;
      readonly hMm: number;
      readonly fill: string;
      readonly mark?: BeadMark;
    }
  | {
      readonly t: 'slot';
      readonly r: number;
      readonly h: number;
      readonly xMm: number;
      readonly yMm: number;
      readonly wMm: number;
      readonly hMm: number;
    }
  | {
      readonly t: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: string;
      readonly role: ShapeRole;
    }
  | {
      readonly t: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly stroke: string;
      readonly fill?: string;
      readonly role: ShapeRole;
    }
  | {
      readonly t: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stroke: string;
    }
  | {
      readonly t: 'marker';
      readonly kind: MarkerKind;
      /** Left edge and vertical centre of the symbol. */
      readonly x: number;
      readonly y: number;
      readonly size: number;
      /** 0-based lattice row. */
      readonly r: number;
      /** Segment count for `segments`. */
      readonly value?: number;
    }
  | {
      readonly t: 'text';
      readonly x: number;
      /** Baseline. */
      readonly y: number;
      readonly text: string;
      /** Font size in millimetres. */
      readonly size: number;
      readonly anchor: 'start' | 'end' | 'middle';
      readonly role: ShapeRole;
      /** 0-based lattice row the text annotates, if any. */
      readonly r?: number;
      readonly fill?: string;
    };

/**
 * Renderer-independent drawing. `origin` is the lattice top-left inside the scene: bead
 * `(r, h)` occupies `[origin.x + h·bw/2, +bw] × [origin.y + r·bh, +bh]`.
 */
export interface Scene {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly origin: { readonly x: number; readonly y: number };
  /** Left gutter width (row numbers, ladder label); `0` when absent. */
  readonly gutterLeftMm: number;
  /** Drawn first: ladder tint. */
  readonly background: readonly Shape[];
  /** Beads and slots per lattice row; unchanged rows are reused by reference. */
  readonly rows: readonly SceneRow[];
  /** Drawn last: gutter texts, markers, loop. */
  readonly overlay: readonly Shape[];
  /** Memoisation inputs: layout signature and palette the rows were built with. */
  readonly layoutKey: string;
  readonly palette: readonly PaletteEntry[];
}

/** Bead/slot shapes of lattice row `r` plus the inputs they were built from. */
export interface SceneRow {
  readonly r: number;
  readonly cells: readonly (ColorId | null)[];
  /** Mark signature of the row. */
  readonly marks: string;
  readonly shapes: readonly Shape[];
}

/** Layers of {@link diagramScene}; all default to off. */
export interface SceneOptions {
  readonly rowNumbers?: boolean;
  readonly counts?: boolean;
  readonly ladder?: boolean;
  readonly loop?: boolean;
  /** Bead marks plus right-gutter `alert` and `segments` markers. */
  readonly warnings?: boolean;
  /** Outline every empty lattice cell (editor). */
  readonly slots?: boolean;
  /** Ladder label, e.g. a localised abbreviation; default `L`. */
  readonly ladderLabel?: string;
}
