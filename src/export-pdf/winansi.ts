const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const FALLBACK: Readonly<Record<string, string>> = {
  '≈': '~',
  '⁄': '/',
  '≥': '>=',
  '≤': '<=',
  '−': '-',
  '→': '->',
  '­': '',
  ' ': ' ',
  ' ': ' ',
};

const encodable = (c: string): boolean => {
  const n = c.codePointAt(0) ?? 0;
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || EXTRA.has(c);
};

/**
 * Text drawable with the PDF standard fonts (WinAnsiEncoding): common look-alikes are
 * substituted and anything else (emoji, symbols) is dropped. jsPDF would otherwise switch the whole string to
 * a two-byte encoding that the standard fonts cannot show.
 */
export const pdfSafe = (s: string): string =>
  Array.from(s.normalize('NFC'), (c) => (encodable(c) ? c : (FALLBACK[c] ?? ''))).join('');
