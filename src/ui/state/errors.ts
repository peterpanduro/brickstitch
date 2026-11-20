import type { MessageKey, ParseError } from '../../core';

const PARSE: readonly ParseError[] = [
  'json',
  'format',
  'version',
  'size',
  'mode',
  'beadType',
  'palette',
  'cells',
  'color',
];

/** Message key for a load/open/save error code or storage exception message. */
export function errorKey(code: string): MessageKey {
  if ((PARSE as readonly string[]).includes(code)) return `parseError.${code as ParseError}`;
  if (code === 'storage') return 'error.storage';
  if (code === 'image') return 'error.image';
  if (/quota/i.test(code)) return 'error.quota';
  return 'error.unknown';
}
