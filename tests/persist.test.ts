import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../src/core';
import { createAutosave, parsePatternFile, serialise } from '../src/core/persist';
import { fromRhJson, fromRowsJson } from './adapters';
import liten from './fixtures/liten.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

const now = new Date('2026-01-02T03:04:05Z');
const pat = fromRowsJson(liten);
const doc = () => JSON.parse(serialise(pat, '0.1.0', now));
type Doc = ReturnType<typeof JSON.parse>;
const parse = (d: unknown) => parsePatternFile(JSON.stringify(d));

describe('serialise / parse', () => {
  it('writes the envelope', () => {
    const d = doc();
    expect(d).toMatchObject({
      format: 'brickstitch-pattern',
      version: 1,
      savedAt: '2026-01-02T03:04:05.000Z',
      app: 'brickstitch@0.1.0',
    });
  });
  it('round-trips fixtures', () => {
    for (const p of [pat, fromRhJson(ripa4 as Record<string, string>)]) {
      expect(parsePatternFile(serialise(p, '0.1.0', now))).toEqual({ ok: true, pattern: p });
    }
  });
});

describe('rejections', () => {
  const bad: [string, (d: Doc) => void, string][] = [
    ['unknown format', (d) => (d.format = 'x'), 'format'],
    ['future version', (d) => (d.version = 2), 'version'],
    ['non-int version', (d) => (d.version = 'a'), 'version'],
    ['missing pattern', (d) => delete d.pattern, 'format'],
    ['bad mode', (d) => (d.pattern.mode = 'x'), 'mode'],
    ['bad beadType', (d) => (d.pattern.beadType = 'x'), 'beadType'],
    ['width range', (d) => (d.pattern.width = 81), 'size'],
    ['bad hex', (d) => (d.pattern.palette[0].hex = 'red'), 'palette'],
    ['duplicate id', (d) => d.pattern.palette.push(d.pattern.palette[0]), 'palette'],
    ['bad row length', (d) => d.pattern.cells[1].push('R'), 'cells'],
    ['wrong height', (d) => d.pattern.cells.pop(), 'cells'],
    ['empty palette id', (d) => (d.pattern.palette[0].id = ''), 'palette'],
    ['missing title', (d) => delete d.pattern.title, 'format'],
    ['non-string description', (d) => (d.pattern.description = 1), 'format'],
    ['dangling colour', (d) => (d.pattern.cells[0][0] = 'Q'), 'color'],
    ['bad ladder', (d) => (d.pattern.ladder = { kind: 'manual', row: 999 }), 'format'],
  ];
  it.each(bad)('%s', (_n, mutate, error) => {
    const d = doc();
    mutate(d);
    expect(parse(d)).toEqual({ ok: false, error });
  });
  it('invalid JSON and non-objects', () => {
    for (const s of ['', '{', 'null', '[]', '42']) {
      expect(parsePatternFile(s).ok).toBe(false);
    }
    expect(parsePatternFile('{')).toEqual({ ok: false, error: 'json' });
  });
  it('allows null cells in panels (panelGaps is a warning, SPEC §2.3)', () => {
    const d = doc();
    d.pattern.cells[0][0] = null;
    const r = parse(d);
    expect(r.ok && r.pattern.cells[0]?.[0]).toBeNull();
  });
  it('drops unknown keys', () => {
    const d = doc();
    d.extra = 1;
    d.pattern.junk = { big: true };
    d.pattern.palette[0].junk = 1;
    d.pattern.ladder.junk = 1;
    expect(parse(d)).toEqual({ ok: true, pattern: pat });
  });
  it('allows null cells in shaped patterns', () => {
    const p = fromRhJson(ripa4 as Record<string, string>);
    expect(parsePatternFile(serialise(p, '1', now)).ok).toBe(true);
  });
});

describe('createAutosave', () => {
  const memory = (): KeyValueStore & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  };
  it('saves and loads', () => {
    const s = memory();
    const a = createAutosave(s, 'k');
    expect(a.load()).toBeNull();
    expect(a.save(pat)).toEqual({ ok: true });
    expect(a.load()).toEqual({ ok: true, pattern: pat });
  });
  it('reports corrupt data instead of hiding it', () => {
    const s = memory();
    s.set('k', '{"nope":1}');
    expect(createAutosave(s, 'k').load()).toEqual({ ok: false, error: 'format' });
  });
  it('never throws on store failures', () => {
    const boom: KeyValueStore = {
      get: () => {
        throw new Error('denied');
      },
      set: () => {
        throw new Error('quota');
      },
    };
    const a = createAutosave(boom, 'k');
    expect(a.load()).toEqual({ ok: false, error: 'storage' });
    expect(a.save(pat)).toEqual({ ok: false, error: 'quota' });
  });
});
