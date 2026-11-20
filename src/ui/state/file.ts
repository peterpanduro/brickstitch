import { serialise, type Pattern } from '../../core';
import type { Route } from './route';

const FOLD: Readonly<Record<string, string>> = {
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  ß: 'ss',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
  œ: 'oe',
  Œ: 'oe',
  þ: 'th',
};

/** Lower-case ASCII file stem from a title; `pattern` when empty. */
export function fileSlug(title: string): string {
  const s = title
    .replace(/[øØæÆßđĐłŁœŒþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'pattern';
}

/** `.brickstitch.json` download name and text for `p`, stamped with `now`. */
export function patternFile(
  p: Pattern,
  appVersion: string,
  now = new Date(),
): { name: string; text: string } {
  return { name: `${fileSlug(p.title)}.brickstitch.json`, text: serialise(p, appVersion, now) };
}

/** What a dropped or picked file is: an image to import or a pattern file to open. */
export const fileKind = (f: { name: string; type: string }): 'image' | 'pattern' =>
  f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name)
    ? 'image'
    : 'pattern';

/** Whether a dropped file is accepted in `route`: the editor and the start page (SPEC R44). */
export const dropAllowed = (route: Route): boolean => route === 'editor' || route === 'new';

/** Size of a `w × h` image scaled down (never up) so its long side is at most `max`. */
export function scaledSize(w: number, h: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
