import {
  rowNumbers,
  type Analysis,
  type MessageKey,
  type Params,
  type Pattern,
  type PluralKey,
  type Warning,
  type WarningCode,
} from '../../core';

/** A message key with its parameters, rendered by the caller's `t`. */
export interface Text {
  readonly key: MessageKey | PluralKey;
  readonly params?: Params;
}

/** What a checklist button does; the UI maps it to an `EditorStore` call. */
export type ChecklistAction =
  | { readonly kind: 'show'; readonly code: WarningCode }
  | { readonly kind: 'removeUnsupported' }
  | { readonly kind: 'autoLadder' }
  | { readonly kind: 'focusLadder' };

/** Button (or, for `focusLadder`, inline link) of a checklist item. */
export interface ChecklistButton {
  readonly label: Text;
  readonly action: ChecklistAction;
}

/** Row of the R48 table, or `empty` for an empty pattern. */
export type ChecklistId = 'ladder' | WarningCode | 'empty';

/**
 * One "Går det att sy?" entry (SPEC R48): an amber issue card or a pass line with a check icon.
 * `counted` issues make up the header pill count (`segments` is listed but not counted).
 */
export interface ChecklistItem {
  readonly id: ChecklistId;
  readonly kind: 'issue' | 'pass';
  readonly title: Text;
  readonly detail?: Text;
  /** Hint shown with the "Ändra" link of the start-row pass line. */
  readonly hint?: Text;
  readonly buttons: readonly ChecklistButton[];
  readonly counted: boolean;
}

/** Header pill: `warn` with the counted issues, `ok`, or `null` for an empty pattern. */
export type ChecklistPill = { readonly kind: 'ok' } | { readonly kind: 'warn'; readonly n: number };

const CODES: readonly WarningCode[] = [
  'floating',
  'needsExtraLadder',
  'thinLine',
  'segments',
  'panelGaps',
];
const PASS: Partial<Record<WarningCode, MessageKey>> = {
  floating: 'check.floating.pass',
  thinLine: 'check.thinLine.pass',
  segments: 'check.segments.pass',
};
const KEYS = {
  floating: 'check.floating',
  needsExtraLadder: 'check.extraLadder',
  thinLine: 'check.thinLine',
  segments: 'check.segments',
  panelGaps: 'check.panelGaps',
} as const;

const show = (code: WarningCode): ChecklistButton => ({
  label: { key: 'check.show' },
  action: { kind: 'show', code },
});
const chooseForMe: ChecklistButton = {
  label: { key: 'check.chooseForMe' },
  action: { kind: 'autoLadder' },
};

function ladderItem(p: Pattern, a: Analysis, n: number): ChecklistItem {
  if (a.invalidManual)
    return {
      id: 'ladder',
      kind: 'issue',
      title: { key: 'check.ladder.invalid' },
      detail: { key: 'check.ladder.invalidDetail', params: { n } },
      buttons: [chooseForMe],
      counted: true,
    };
  const manual = p.ladder.kind === 'manual';
  return {
    id: 'ladder',
    kind: 'pass',
    title: { key: manual ? 'check.ladder.manual' : 'check.ladder.auto', params: { n } },
    hint: { key: 'check.ladder.hint' },
    buttons: [
      { label: { key: 'check.ladder.change' }, action: { kind: 'focusLadder' } },
      ...(manual ? [chooseForMe] : []),
    ],
    counted: false,
  };
}

function warningItem(
  p: Pattern,
  code: WarningCode,
  ws: readonly Warning[],
  num: (r: number) => number,
): ChecklistItem | null {
  const k = KEYS[code];
  if (ws.length === 0) {
    const pass = PASS[code];
    return pass
      ? { id: code, kind: 'pass', title: { key: pass }, buttons: [], counted: false }
      : null;
  }
  const first = ws.reduce((m, w) => (w.r < m.r ? w : m));
  const n = ws.length;
  const r = num(first.r);
  const value = 'value' in first ? first.value : 0;
  const buttons = [show(code)];
  if (code === 'floating' && p.mode === 'shaped')
    buttons.push({
      label: { key: 'check.floating.remove', params: { n } },
      action: { kind: 'removeUnsupported' },
    });
  return {
    id: code,
    kind: 'issue',
    title: { key: `${k}.title`, params: { n, r, value } },
    detail: { key: `${k}.detail`, params: { r, end: r + value - 1 } },
    buttons,
    counted: code !== 'segments',
  };
}

/** The "Går det att sy?" items of `p` in R48 table order (start row, then warning codes). */
export function checklist(p: Pattern, a: Analysis): ChecklistItem[] {
  if (a.ladderRow === null)
    return [
      { id: 'empty', kind: 'pass', title: { key: 'check.empty' }, buttons: [], counted: false },
    ];
  const numbers = rowNumbers(p);
  const num = (r: number): number =>
    numbers[r] ?? numbers.slice(0, r).filter((n) => n !== null).length + 1;
  const items = [ladderItem(p, a, num(a.ladderRow))];
  for (const code of CODES) {
    const it = warningItem(
      p,
      code,
      a.warnings.filter((w) => w.code === code),
      num,
    );
    if (it) items.push(it);
  }
  return items;
}

/** Header pill of `items`; `null` for an empty pattern. */
export function checklistPill(items: readonly ChecklistItem[]): ChecklistPill | null {
  if (items.some((i) => i.id === 'empty')) return null;
  const n = items.filter((i) => i.counted).length;
  return n > 0 ? { kind: 'warn', n } : { kind: 'ok' };
}

/**
 * Live-region text after a fix button (SPEC R48): the removed bead count (from `before`) or the
 * start row chosen for you (from `after`); `null` for actions that fix nothing.
 */
export function fixAnnouncement(
  action: ChecklistAction,
  before: readonly ChecklistItem[],
  after: readonly ChecklistItem[],
): Text | null {
  if (action.kind === 'removeUnsupported') {
    const n = before.find((i) => i.id === 'floating' && i.kind === 'issue')?.title.params?.n ?? 0;
    return { key: 'check.removed', params: { n } };
  }
  if (action.kind === 'autoLadder') return after.find((i) => i.id === 'ladder')?.title ?? null;
  return null;
}

/** Text of a {@link ChecklistPill}. */
export const pillText = (pill: ChecklistPill): Text =>
  pill.kind === 'ok'
    ? { key: 'check.pill.ok' }
    : { key: 'check.pill.issues', params: { n: pill.n } };
