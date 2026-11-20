import type { RgbaImage } from '../src/core/imaging';

/** RGBA colour 0..255. */
export type Rgba = readonly [number, number, number, number];

/** Anti-aliased image: `f` sampled `ss × ss` times per pixel and averaged. */
export function aaImage(
  w: number,
  h: number,
  f: (x: number, y: number) => Rgba,
  ss = 4,
): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const c = f(x + (i + 0.5) / ss, y + (j + 0.5) / ss);
          for (let k = 0; k < 4; k++) acc[k]! += c[k]!;
        }
      data.set(
        acc.map((v) => Math.round(v / ss / ss)),
        (y * w + x) * 4,
      );
    }
  return { width: w, height: h, data };
}

export const WHITE: Rgba = [255, 255, 255, 255];
export const BLACK: Rgba = [0, 0, 0, 255];
export const CLEAR: Rgba = [255, 255, 255, 0];
export const RED: Rgba = [215, 38, 43, 255];
export const BLUE: Rgba = [0, 53, 173, 255];

/** White bird (body ellipse + head) with a black outline `line` px wide, yellow beak, on `bg`. */
export const aaBird = (bg: Rgba = CLEAR, line = 6): RgbaImage =>
  aaImage(400, 400, (x, y) => {
    const e = Math.hypot((x - 200) / 150, (y - 220) / 100);
    const h = Math.hypot(x - 300, y - 120) / 50;
    if (x > 340 && x < 380 && Math.abs(y - 120) < (380 - x) / 4) return [255, 206, 0, 255];
    if (Math.min(e, h) > 1) return bg;
    const inset = Math.min(e > 1 ? 1e9 : (1 - e) * 100, h > 1 ? 1e9 : (1 - h) * 50);
    return inset < line || Math.hypot(x - 310, y - 110) < 6 ? BLACK : WHITE;
  });

/** Black line drawing on white: outer circle, diagonal, inner circle, horizontal bar. */
export const aaLines = (): RgbaImage =>
  aaImage(400, 400, (x, y) => {
    const r = Math.hypot(x - 200, y - 200);
    if (Math.abs(r - 150) < 1.5) return BLACK;
    if (Math.abs(x - y) < 1.2 && r < 150) return BLACK;
    if (Math.abs(r - 60) < 1) return BLACK;
    if (Math.abs(y - 300) < 1.8 && x > 120 && x < 280) return BLACK;
    return WHITE;
  });

/** O, C and G shapes as thick strokes in `fg` on white. */
export const aaOcg = (fg: Rgba): RgbaImage =>
  aaImage(600, 240, (x, y) => {
    const ring = (cx: number) => Math.abs(Math.hypot(x - cx, y - 120) - 70) < 14;
    const ang = (cx: number) => Math.atan2(y - 120, x - cx);
    const o = ring(100);
    const c = ring(300) && Math.abs(ang(300)) > 0.6;
    const g =
      (ring(500) && !(ang(500) < -0.1 && ang(500) > -0.8)) ||
      (Math.abs(y - 125) < 10 && x > 500 && x < 570);
    return o || c || g ? fg : WHITE;
  });

/** Square on white, left half red, right half blue. */
export const aaSquare2 = (): RgbaImage =>
  aaImage(300, 300, (x, y) =>
    x > 60 && x < 240 && y > 60 && y < 240 ? (x < 150 ? RED : BLUE) : WHITE,
  );

/** Palette of the reviewer comparison: white, black, red, blue, green, yellow, grey, pink. */
export const AA_PALETTE = [
  '#ffffff',
  '#000000',
  '#d7262b',
  '#0035ad',
  '#007229',
  '#ffce00',
  '#808080',
  '#f0a0a0',
].map((hex, i) => ({ id: `c${i}`, hex }));
