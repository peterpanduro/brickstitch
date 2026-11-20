import { HATCH_ID, HATCH_LINE, shapeElements, type SvgElement } from './elements';
import { SCENE_STYLE } from './style';
import type { Scene, Shape } from './types';

const n = (x: number): number => +x.toFixed(3);
const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const el = ({ tag, attrs, text }: SvgElement): string => {
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
  return text === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${esc(text)}</${tag}>`;
};

/** All shapes of a scene in paint order: background, rows, overlay. */
export const sceneShapes = (s: Scene): Shape[] => [
  ...s.background,
  ...s.rows.flatMap((r) => r.shapes),
  ...s.overlay,
];

/** Standalone SVG document of `scene`; user units are millimetres, sized in `mm`. */
export function sceneToSvg(scene: Scene): string {
  const w = n(scene.widthMm);
  const h = n(scene.heightMm);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" font-family="${SCENE_STYLE.fontFamily}">`,
    `<defs><pattern id="${HATCH_ID}" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">${el(HATCH_LINE)}</pattern></defs>`,
    ...sceneShapes(scene).flatMap((s) => shapeElements(s).map(el)),
    '</svg>',
  ].join('');
}
