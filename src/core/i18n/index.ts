import type { RowNote } from '../instructions/types';
import type { Warning } from '../feasibility/types';
import { en } from './messages.en';
import { sv } from './messages.sv';
import type { MessageKey, Messages, PluralKey } from './messages.sv';
import type { Locale } from './types';

export { en, sv };
export type { MessageKey, Messages, PluralKey };
export type * from './types';

const CATALOGUES: Readonly<Record<Locale, Messages>> = { sv, en };

/** Interpolation values for `{name}` placeholders. */
export type Params = Readonly<Record<string, string | number>>;

/** Locale-bound message lookup, e.g. the editor's `t`. */
export type Translate = (key: MessageKey | PluralKey, params?: Params) => string;

/**
 * Looks up `key` in `locale` and substitutes `{name}` placeholders; unknown ones stay intact.
 * A {@link PluralKey} resolves to `<key>_one` when `params.n === 1`, else `<key>_other`.
 */
export function t(locale: Locale, key: MessageKey | PluralKey, params?: Params): string {
  const cat = CATALOGUES[locale];
  const k = (key in cat ? key : `${key}_${params?.n === 1 ? 'one' : 'other'}`) as MessageKey;
  return cat[k].replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params?.[name];
    return v === undefined ? m : String(v);
  });
}

/** Millimetres with one decimal and the locale's decimal separator. */
export const formatMm = (locale: Locale, mm: number): string => {
  const s = mm.toFixed(1);
  return locale === 'sv' ? s.replace('.', ',') : s;
};

/** Localised text of a row note. */
export function formatNote(locale: Locale, note: RowNote): string {
  switch (note.kind) {
    case 'ladderStart':
      return t(locale, 'note.ladderStart');
    case 'increase':
      return t(locale, 'note.increase', { n: note.count, side: t(locale, `side.${note.side}`) });
    case 'stepIn':
      return t(locale, 'note.stepIn', { n: note.count, side: t(locale, `side.${note.side}`) });
    case 'parts':
      return t(locale, 'note.parts', { n: note.count });
    case 'extraLadder':
      return t(locale, 'note.extraLadder', {
        n: note.count,
        side: t(locale, `side.${note.side}`),
      });
  }
}

/** Localised user-facing text of a feasibility warning. */
export function formatWarning(locale: Locale, w: Warning): string {
  switch (w.code) {
    case 'segments':
    case 'thinLine':
      return t(locale, `warning.${w.code}`, { n: w.value });
    default:
      return t(locale, `warning.${w.code}`);
  }
}
