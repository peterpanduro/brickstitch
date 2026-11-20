import type { RgbaImage } from '../src/core/imaging';

type Rgb = readonly [number, number, number];
const RED: Rgb = [0xd7, 0x26, 0x2b];
const GREEN: Rgb = [0x00, 0x72, 0x29];
const YELLOW: Rgb = [0xff, 0xce, 0x00];
const BLUE: Rgb = [0x00, 0x35, 0xad];

/**
 * Synthetic full-bleed Sami flag, 4:3: red | green | yellow | blue, ring centred on the stripes,
 * blue over the red half and red over the blue half. `rotate` puts red on top (liten earring).
 */
export function samiFlag(w = 400, h = 300, rotate = false): RgbaImage {
  const cx = w * 0.4375;
  const cy = h / 2;
  const stripe = w * 0.0625;
  const rMid = 0.3 * h;
  const half = 0.03 * h;
  const ow = rotate ? h : w;
  const oh = rotate ? w : h;
  const data = new Uint8ClampedArray(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++)
    for (let ox = 0; ox < ow; ox++) {
      const x = (rotate ? oy : ox) + 0.5;
      const y = (rotate ? ow - 1 - ox : oy) + 0.5;
      const ring = Math.abs(Math.hypot(x - cx, y - cy) - rMid) <= half;
      const c = ring
        ? x < cx
          ? BLUE
          : RED
        : x < cx - stripe
          ? RED
          : x < cx
            ? GREEN
            : x < cx + stripe
              ? YELLOW
              : BLUE;
      const i = (oy * ow + ox) * 4;
      data.set([c[0], c[1], c[2], 255], i);
    }
  return { width: ow, height: oh, data };
}
