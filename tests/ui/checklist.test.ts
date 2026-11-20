import { describe, expect, it } from 'vitest';
import {
  createPattern,
  t,
  type Analysis,
  type Pattern,
  type PatternMode,
  type Warning,
} from '../../src/core';
import {
  checklist,
  checklistPill,
  fixAnnouncement,
  pillText,
  type ChecklistItem,
  type Text,
} from '../../src/ui/state/checklist';

const W = { id: 'w', db: 'DB-200', hex: '#F7F7F5' };

function pattern(mode: PatternMode, manual?: number): Pattern {
  const p = createPattern({
    beadType: 'delica11',
    mode,
    width: 4,
    height: 8,
    palette: [W],
    fill: 'w',
  });
  const cells = p.cells.map((row, r) => row.map(() => (r < 2 ? null : 'w')));
  return {
    ...p,
    cells,
    ladder: manual === undefined ? { kind: 'auto' } : { kind: 'manual', row: manual },
  };
}

const analysis = (warnings: Warning[], o: Partial<Analysis> = {}): Analysis => ({
  ladderRow: 4,
  invalidManual: false,
  status: [],
  warnings,
  ...o,
});

const sv = (x: Text) => t('sv', x.key, x.params);
const en = (x: Text) => t('en', x.key, x.params);
const item = (items: ChecklistItem[], id: ChecklistItem['id']) => {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const labels = (i: ChecklistItem) => i.buttons.map((b) => sv(b.label));

describe('checklist: start row', () => {
  it('passes with the auto row, R6-numbered, with Ändra', () => {
    const items = checklist(pattern('shaped'), analysis([]));
    const l = item(items, 'ladder');
    expect(l.kind).toBe('pass');
    expect(sv(l.title)).toBe('Startrad: rad 3 (vald åt dig)');
    expect(en(l.title)).toBe('Start row: row 3 (chosen for you)');
    expect(labels(l)).toEqual(['Ändra']);
    expect(l.buttons[0]?.action).toEqual({ kind: 'focusLadder' });
    expect(l.hint && sv(l.hint)).toBe('Klicka på ett radnummer för att börja där');
  });

  it('offers Välj åt mig on a manual row', () => {
    const l = item(checklist(pattern('shaped', 4), analysis([])), 'ladder');
    expect(sv(l.title)).toBe('Startrad: rad 3 (vald av dig)');
    expect(labels(l)).toEqual(['Ändra', 'Välj åt mig']);
    expect(l.buttons[1]?.action).toEqual({ kind: 'autoLadder' });
  });

  it('is an issue when the manual row is invalid', () => {
    const items = checklist(pattern('shaped', 0), analysis([], { invalidManual: true }));
    const l = item(items, 'ladder');
    expect(l.kind).toBe('issue');
    expect(sv(l.title)).toBe('Startraden du valde går inte');
    expect(l.detail && sv(l.detail)).toBe('Appen använder rad 3 i stället.');
    expect(labels(l)).toEqual(['Välj åt mig']);
    expect(checklistPill(items)).toEqual({ kind: 'warn', n: 1 });
  });
});

describe('checklist: warnings', () => {
  it('floating: plural titles, first row, Visa and Ta bort on shaped only', () => {
    const one = checklist(pattern('shaped'), analysis([{ code: 'floating', r: 5, h: 2 }]));
    const f1 = item(one, 'floating');
    expect([f1.kind, sv(f1.title), en(f1.title)]).toEqual([
      'issue',
      'En pärla sitter löst',
      'One bead is loose',
    ]);
    expect(f1.detail && sv(f1.detail)).toBe('Rad 4: pärlan har ingen granne att fästa i.');
    expect(labels(f1)).toEqual(['Visa', 'Ta bort den']);
    expect(f1.buttons.map((b) => b.action)).toEqual([
      { kind: 'show', code: 'floating' },
      { kind: 'removeUnsupported' },
    ]);
    const two = checklist(
      pattern('shaped'),
      analysis([
        { code: 'floating', r: 6, h: 2 },
        { code: 'floating', r: 3, h: 2 },
      ]),
    );
    const f2 = item(two, 'floating');
    expect(sv(f2.title)).toBe('2 pärlor sitter löst');
    expect(f2.detail && sv(f2.detail)).toBe('Rad 2: pärlan har ingen granne att fästa i.');
    expect(labels(f2)).toEqual(['Visa', 'Ta bort dem']);
    const panel = checklist(pattern('panel'), analysis([{ code: 'floating', r: 5, h: 2 }]));
    expect(labels(item(panel, 'floating'))).toEqual(['Visa']);
  });

  it('floating passes when there are none', () => {
    const f = item(checklist(pattern('shaped'), analysis([])), 'floating');
    expect([f.kind, sv(f.title)]).toEqual(['pass', 'Alla pärlor sitter fast']);
  });

  it('needsExtraLadder: issue with Visa, no pass line', () => {
    const items = checklist(
      pattern('shaped'),
      analysis([
        { code: 'needsExtraLadder', r: 3, h: 1 },
        { code: 'needsExtraLadder', r: 3, h: 3 },
      ]),
    );
    const x = item(items, 'needsExtraLadder');
    expect(sv(x.title)).toBe('2 pärlor behöver extra stegsöm');
    expect(x.detail && sv(x.detail)).toBe(
      'Rad 2: sticker ut mer än en halv pärla. Det går att sy – mönstret visar hur.',
    );
    expect(labels(x)).toEqual(['Visa']);
    expect(
      checklist(pattern('shaped'), analysis([])).some((i) => i.id === 'needsExtraLadder'),
    ).toBe(false);
  });

  it('thinLine: chains with the row range', () => {
    const items = checklist(
      pattern('shaped'),
      analysis([{ code: 'thinLine', r: 2, h: 1, value: 3 }]),
    );
    const x = item(items, 'thinLine');
    expect(sv(x.title)).toBe('En linje är för tunn');
    expect(x.detail && sv(x.detail)).toBe('Rad 1–3: bara en pärla bred, blir lätt sladdrig.');
    const pass = item(checklist(pattern('shaped'), analysis([])), 'thinLine');
    expect(sv(pass.title)).toBe('Inga för tunna linjer');
  });

  it('segments: listed but not counted in the pill', () => {
    const one = checklist(pattern('shaped'), analysis([{ code: 'segments', r: 4, value: 2 }]));
    const s = item(one, 'segments');
    expect([s.kind, sv(s.title)]).toEqual(['issue', 'Rad 3 är delad i 2 delar']);
    expect(s.detail && sv(s.detail)).toBe('Varje del sys för sig.');
    expect(labels(s)).toEqual(['Visa']);
    expect(checklistPill(one)).toEqual({ kind: 'ok' });
    const two = checklist(
      pattern('shaped'),
      analysis([
        { code: 'segments', r: 4, value: 2 },
        { code: 'segments', r: 5, value: 3 },
      ]),
    );
    expect(sv(item(two, 'segments').title)).toBe('2 rader är delade');
    const pass = item(checklist(pattern('shaped'), analysis([])), 'segments');
    expect(sv(pass.title)).toBe('Alla rader hänger ihop');
  });

  it('panelGaps: holes with Visa, no pass line', () => {
    const items = checklist(pattern('panel'), analysis([{ code: 'panelGaps', r: 2, h: 0 }]));
    const x = item(items, 'panelGaps');
    expect(sv(x.title)).toBe('Det finns ett hål i rektangeln');
    expect(x.detail && sv(x.detail)).toBe('Rad 1: tom plats.');
    const many = checklist(
      pattern('panel'),
      analysis([
        { code: 'panelGaps', r: 2, h: 0 },
        { code: 'panelGaps', r: 3, h: 1 },
        { code: 'panelGaps', r: 3, h: 3 },
      ]),
    );
    expect(sv(item(many, 'panelGaps').title)).toBe('3 hål i rektangeln');
    expect(checklist(pattern('panel'), analysis([])).some((i) => i.id === 'panelGaps')).toBe(false);
  });

  it('orders the rows like the R48 table', () => {
    const ws: Warning[] = [
      { code: 'panelGaps', r: 2, h: 0 },
      { code: 'segments', r: 4, value: 2 },
      { code: 'thinLine', r: 2, h: 1, value: 3 },
      { code: 'needsExtraLadder', r: 3, h: 1 },
      { code: 'floating', r: 5, h: 2 },
    ];
    expect(checklist(pattern('panel'), analysis(ws)).map((i) => i.id)).toEqual([
      'ladder',
      'floating',
      'needsExtraLadder',
      'thinLine',
      'segments',
      'panelGaps',
    ]);
  });
});

describe('checklist pill', () => {
  it('counts the start-row issue and each non-zero code except segments', () => {
    const ws: Warning[] = [
      { code: 'floating', r: 5, h: 2 },
      { code: 'floating', r: 6, h: 2 },
      { code: 'thinLine', r: 2, h: 1, value: 3 },
      { code: 'segments', r: 4, value: 2 },
    ];
    const items = checklist(pattern('shaped', 0), analysis(ws, { invalidManual: true }));
    const pill = checklistPill(items);
    expect(pill).toEqual({ kind: 'warn', n: 3 });
    expect(pill && sv(pillText(pill))).toBe('3 saker att titta på');
    expect(sv(pillText({ kind: 'warn', n: 1 }))).toBe('1 sak att titta på');
    expect(sv(pillText({ kind: 'ok' }))).toBe('Går att sy');
  });

  it('shows only "Mönstret är tomt" and no pill for an empty pattern', () => {
    const p = createPattern({
      beadType: 'delica11',
      mode: 'shaped',
      width: 4,
      height: 4,
      palette: [W],
    });
    const items = checklist(p, analysis([], { ladderRow: null }));
    expect(items).toHaveLength(1);
    expect(items[0] && [items[0].id, items[0].kind, sv(items[0].title)]).toEqual([
      'empty',
      'pass',
      'Mönstret är tomt',
    ]);
    expect(checklistPill(items)).toBeNull();
  });
});

describe('checklist row numbers', () => {
  it('numbers a gap in an empty row like R6 (empty rows skipped)', () => {
    const p = pattern('panel');
    const cells = p.cells.map((row, r) => row.map((c) => (r === 4 ? null : c)));
    const items = checklist({ ...p, cells }, analysis([{ code: 'panelGaps', r: 4, h: 0 }]));
    const x = items.find((i) => i.id === 'panelGaps');
    expect(x?.detail && sv(x.detail)).toBe('Rad 3: tom plats.');
  });
});

describe('fixAnnouncement', () => {
  const floating = (n: number): Analysis =>
    analysis(Array.from({ length: n }, (_, i): Warning => ({ code: 'floating', r: 5 + i, h: 2 })));

  it('announces removed beads with the count before the fix', () => {
    const after = checklist(pattern('shaped'), analysis([]));
    const two = checklist(pattern('shaped'), floating(2));
    const a = fixAnnouncement({ kind: 'removeUnsupported' }, two, after);
    expect(a && sv(a)).toBe('2 pärlor togs bort');
    const one = checklist(pattern('shaped'), floating(1));
    const b = fixAnnouncement({ kind: 'removeUnsupported' }, one, after);
    expect(b && en(b)).toBe('1 bead removed');
  });

  it('announces the start row chosen by Välj åt mig', () => {
    const before = checklist(pattern('shaped', 0), analysis([], { invalidManual: true }));
    const after = checklist(pattern('shaped'), analysis([]));
    const a = fixAnnouncement({ kind: 'autoLadder' }, before, after);
    expect(a && sv(a)).toBe('Startrad: rad 3 (vald åt dig)');
  });

  it('announces nothing for Visa and Ändra', () => {
    const items = checklist(pattern('shaped'), floating(1));
    expect(fixAnnouncement({ kind: 'show', code: 'floating' }, items, items)).toBeNull();
    expect(fixAnnouncement({ kind: 'focusLadder' }, items, items)).toBeNull();
  });
});
