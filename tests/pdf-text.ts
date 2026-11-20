const WIN_ANSI_HIGH: Readonly<Record<number, string>> = {
  0x80: '€',
  0x82: '‚',
  0x84: '„',
  0x85: '…',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
};

const unescape = (s: string): string =>
  s.replace(/\\([0-7]{1,3}|.)/g, (_, e: string) => {
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[e] ?? e;
  });

const latin1 = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('');

const textBlocks = (bytes: Uint8Array): string[] =>
  latin1(bytes).match(/^BT\n[\s\S]*?\nET$/gm) ?? [];

const blockStrings = (block: string): string[] =>
  [...block.matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((m) =>
    [...unescape(m[1] ?? '')].map((c) => WIN_ANSI_HIGH[c.charCodeAt(0)] ?? c).join(''),
  );

/**
 * Test-only: text shown by an uncompressed PDF, one entry per string operand inside BT…ET,
 * decoded from WinAnsi.
 */
export const pdfStrings = (bytes: Uint8Array): string[] => textBlocks(bytes).flatMap(blockStrings);

/** Test-only: every shown string with its baseline position in mm from the page's top-left. */
export function textPositions(bytes: Uint8Array): { text: string; x: number; y: number }[] {
  const k = 25.4 / 72;
  return textBlocks(bytes).flatMap((b) => {
    const m = b.match(/([\d.-]+) ([\d.-]+) Td/);
    const [x, y] = [Number(m?.[1]) * k, 297 - Number(m?.[2]) * k];
    return blockStrings(b).map((text) => ({ text, x, y }));
  });
}

/** Number of page objects in a PDF. */
export const pageCount = (bytes: Uint8Array): number =>
  (latin1(bytes).match(/\/Type \/Page\b/g) ?? []).length;
