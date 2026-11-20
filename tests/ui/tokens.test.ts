import { describe, expect, it } from 'vitest';
import css from '../../src/ui/app.css?raw';

type Tokens = Record<string, string>;

function block(selector: string, src: string): Tokens {
  const start = src.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('}', start));
  const out: Tokens = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
const light = block(':root', css);
const darkAttr = block(":root[data-theme='dark']", css);
const darkMedia = block(":root:not([data-theme='light'])", css.slice(mediaStart));

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? [...n].map((c) => c + c).join('') : n;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const TEXT: [string, string][] = [
  ...['ink', 'muted'].flatMap((f) =>
    ['bg', 'surface', 'surface-2'].map((b): [string, string] => [f, b]),
  ),
  ['accent-ink', 'accent'],
  ['warn', 'warn-soft'],
  ['ok', 'ok-soft'],
  ['danger', 'danger-soft'],
  ['ink', 'ladder'],
  ['ink', 'paper'],
  ...['ink', 'muted'].flatMap((f) =>
    ['accent-soft', 'warn-soft'].map((b): [string, string] => [f, b]),
  ),
  ['muted', 'paper'],
  ...['accent', 'warn', 'ok', 'danger'].map((f): [string, string] => [f, 'surface']),
  ['accent', 'bg'],
  ['accent', 'surface-2'],
  ['accent', 'accent-soft'],
];
const UI: [string, string][] = [
  ['line-strong', 'surface'],
  ['line-strong', 'surface-2'],
  ...['bg', 'surface', 'surface-2'].map((b): [string, string] => ['accent', b]),
];

describe('design tokens (R45)', () => {
  it('turns off all transitions and animations under prefers-reduced-motion (R56)', () => {
    expect(css.replace(/\s+/g, ' ')).toContain(
      '@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }',
    );
  });

  it('parses the light block with the R45 colours', () => {
    expect(light['--bg']).toBe('#f4efe7');
    expect(light['--line-strong']).toBe('#857c6c');
    expect(light['--shadow']).toBeDefined();
  });

  it('gives every light token a value in both dark blocks', () => {
    expect(Object.keys(darkAttr).sort()).toEqual(Object.keys(light).sort());
    expect(darkMedia).toEqual(darkAttr);
  });

  it.each([
    ['light', light],
    ['dark', darkAttr],
  ])('meets the contrast minimums in %s', (_name, tokens) => {
    const v = (k: string) => tokens[`--${k}`] ?? '';
    for (const [f, b] of TEXT)
      expect(contrast(v(f), v(b)), `${f} on ${b}`).toBeGreaterThanOrEqual(4.5);
    for (const [f, b] of UI) expect(contrast(v(f), v(b)), `${f} on ${b}`).toBeGreaterThanOrEqual(3);
  });

  it('has no old variable aliases left (P7)', () => {
    for (const name of ['--panel', '--text', '--canvas-bg'])
      expect(css, name).not.toMatch(new RegExp(`${name}\\s*:`));
  });
});
