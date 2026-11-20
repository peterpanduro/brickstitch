import { describe, expect, it } from 'vitest';
import { analyse } from '../src/core/analyse';
import { BEAD_TYPES, hOf } from '../src/core/geometry';
import { beadCoords } from '../src/core/pattern/rows';
import {
  cellsAlong,
  diagramScene,
  hitTest,
  sceneShapes,
  sceneToSvg,
  shapeElements,
  SCENE_STYLE,
  type Scene,
  type Shape,
} from '../src/core/scene';
import type { Pattern } from '../src/core';
import { fromRhJson, fromRowsJson } from './adapters';
import { shaped } from './shaped';
import liten from './fixtures/liten.rows.json';
import ripa4 from './fixtures/ripa4_rh.json';

const ALL = {
  rowNumbers: true,
  counts: true,
  ladder: true,
  loop: true,
  warnings: true,
  slots: true,
} as const;

const scene = (p: Pattern, opts = ALL): Scene => diagramScene(p, analyse(p), opts);
const of = <T extends Shape['t']>(s: Scene, t: T) =>
  sceneShapes(s).filter((x): x is Extract<Shape, { t: T }> => x.t === t);
const texts = (s: Scene, role: string) => of(s, 'text').filter((x) => x.role === role);

describe('diagramScene: fixtures', () => {
  it('liten panel: one bead shape per bead, numbers and counts per row, ladder, loop', () => {
    const s = scene(fromRowsJson(liten));
    expect(of(s, 'bead')).toHaveLength(231);
    expect(of(s, 'slot')).toHaveLength(0);
    expect(texts(s, 'rowNumber').map((x) => x.text)).toEqual(
      Array.from({ length: 22 }, (_, i) => String(i + 1)),
    );
    expect(texts(s, 'count').map((x) => x.text)).toEqual(
      Array.from({ length: 22 }, (_, r) => String(r % 2 ? 10 : 11)),
    );
    expect(of(s, 'rect').filter((x) => x.role === 'ladder')).toHaveLength(1);
    expect(texts(s, 'ladder')).toHaveLength(1);
    expect(of(s, 'circle').filter((x) => x.role === 'loop')).toHaveLength(1);
  });

  it('ripa4 shaped: 268 beads, slots fill the rest of the lattice, 27 numbered rows', () => {
    const p = fromRhJson(ripa4);
    const s = scene(p);
    const lattice = p.cells.reduce((n, row) => n + row.length, 0);
    expect(of(s, 'bead')).toHaveLength(268);
    expect(of(s, 'slot')).toHaveLength(lattice - 268);
    expect(texts(s, 'rowNumber')).toHaveLength(27);
    const seg = of(s, 'marker').filter((x) => x.kind === 'segments');
    expect(seg.map((x) => [x.r, x.value])).toEqual([
      [23, 2],
      [24, 3],
      [25, 3],
      [26, 2],
    ]);
    expect(of(s, 'text').some((x) => /[⚠⑂]/.test(x.text))).toBe(false);
  });

  it('places the ladder tint on the analysed ladder row', () => {
    const p = fromRhJson(ripa4);
    const s = scene(p);
    const bh = BEAD_TYPES.delica11.rowPitchMm;
    const tint = of(s, 'rect').find((x) => x.role === 'ladder');
    expect(tint?.y).toBeCloseTo(s.origin.y + 17 * bh);
  });

  it('omits optional layers when disabled', () => {
    const s = diagramScene(fromRowsJson(liten), analyse(fromRowsJson(liten)), {});
    expect(sceneShapes(s).every((x) => x.t === 'bead')).toBe(true);
    expect(s.origin).toEqual({ x: 0, y: 0 });
    expect(s.widthMm).toBeCloseTo(11 * 1.6);
    expect(s.heightMm).toBeCloseTo(22 * 1.3);
  });

  it('scales with the bead type', () => {
    const p = { ...fromRowsJson(liten), beadType: 'delica15' as const };
    const s = diagramScene(p, analyse(p), {});
    expect(s.widthMm).toBeCloseTo(11 * 1.3);
    expect(s.heightMm).toBeCloseTo(22 * 1.15);
  });
});

describe('diagramScene: geometry and marks', () => {
  it('centres beads at (h·bw/2, r·bh) relative to the lattice origin, with a gap', () => {
    const p = shaped(['KK', 'K']);
    const s = diagramScene(p, analyse(p), {});
    const b = of(s, 'bead').find((x) => x.r === 1 && x.h === 1);
    expect(b).toBeDefined();
    if (!b) return;
    expect(b.xMm + b.wMm / 2).toBeCloseTo(1.6 / 2 + 1.6 / 2);
    expect(b.yMm + b.hMm / 2).toBeCloseTo(1.3 + 1.3 / 2);
    expect(b.wMm).toBeLessThan(1.6);
    expect(b.hMm).toBeLessThan(1.3);
  });

  it('marks floating and extra-ladder beads when warnings are on', () => {
    const p = { ...shaped(['KKK', 'K.', '...', '.K']), palette: [] };
    const s = scene(p);
    const marks = of(s, 'bead').filter((x) => x.mark);
    expect(marks).toEqual([expect.objectContaining({ r: 3, h: 3, mark: 'floating' })]);
    expect(of(s, 'marker').map((x) => [x.kind, x.r])).toEqual([['alert', 3]]);
    expect(of(diagramScene(p, analyse(p), {}), 'bead').some((x) => x.mark)).toBe(false);
  });

  it('marks extra-ladder beads', () => {
    const p = shaped(['.K..', 'KKK']);
    const s = diagramScene(p, analyse(p, 0), { warnings: true });
    expect(of(s, 'bead').filter((x) => x.mark === 'extraLadder')).toEqual([
      expect.objectContaining({ r: 1, h: 5 }),
    ]);
  });

  it('marks every bead of a thin line chain', () => {
    const p = shaped(['...A.', '..A.', '..A..', '.A..', 'AAAAA']);
    const s = diagramScene(p, analyse(p, 4), { warnings: true });
    expect(
      of(s, 'bead')
        .filter((x) => x.mark === 'thin')
        .map((x) => [x.r, x.h]),
    ).toEqual([
      [0, 6],
      [1, 5],
      [2, 4],
    ]);
  });

  it('labels the ladder with the given label', () => {
    const p = fromRowsJson(liten);
    const s = diagramScene(p, analyse(p), { ladder: true, rowNumbers: true, ladderLabel: 'S' });
    expect(texts(s, 'ladder').map((x) => x.text)).toEqual(['S']);
  });
});

describe('hitTest', () => {
  for (const [name, p] of [
    ['liten', fromRowsJson(liten)],
    ['ripa4', fromRhJson(ripa4)],
    ['liten 15/0', { ...fromRowsJson(liten), beadType: 'delica15' as const }],
  ] as const) {
    it(`${name}: every bead centre round-trips`, () => {
      const t = BEAD_TYPES[p.beadType];
      for (const c of beadCoords(p)) {
        const x = (c.h * t.widthMm) / 2 + t.widthMm / 2;
        const y = c.r * t.rowPitchMm + t.rowPitchMm / 2;
        expect(hitTest(p, x, y)).toEqual(c);
      }
    });
  }

  it('maps bead edges to the right cell and misses outside the lattice', () => {
    const p = fromRowsJson(liten);
    expect(hitTest(p, 0.01, 0.01)).toEqual({ r: 0, h: 0 });
    expect(hitTest(p, 1.59, 1.29)).toEqual({ r: 0, h: 0 });
    expect(hitTest(p, 1.61, 0.01)).toEqual({ r: 0, h: 2 });
    expect(hitTest(p, 0.5, 1.4)).toBeNull();
    expect(hitTest(p, 0.9, 1.4)).toEqual({ r: 1, h: hOf(1, 0) });
    expect(hitTest(p, -0.1, 0.5)).toBeNull();
    expect(hitTest(p, 0.5, -0.1)).toBeNull();
    expect(hitTest(p, 11 * 1.6 + 0.1, 0.5)).toBeNull();
    expect(hitTest(p, 0.5, 22 * 1.3 + 0.1)).toBeNull();
  });
});

describe('sceneToSvg', () => {
  it('is well-formed XML with one element per shape and escaped text', () => {
    const p = fromRhJson(ripa4);
    const s = scene(p);
    const svg = sceneToSvg({
      ...s,
      overlay: [
        ...s.overlay,
        { t: 'text', x: 0, y: 0, text: '<&">', size: 1, anchor: 'start', role: 'label' },
      ],
    });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${+s.widthMm.toFixed(3)} ${+s.heightMm.toFixed(3)}"`);
    expect(svg).toContain('&lt;&amp;&quot;&gt;');
    const opens = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*?(?<!\/)>/g) ?? []).length;
    const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect((svg.match(/data-bead/g) ?? []).length).toBe(268);
  });

  it('serialises exactly the shared per-shape elements', () => {
    const s = scene(fromRhJson(ripa4));
    const els = sceneShapes(s).flatMap((x) => shapeElements(x));
    const svg = sceneToSvg(s);
    for (const tag of ['rect', 'circle', 'text', 'polygon', 'polyline']) {
      const n = els.filter((e) => e.tag === tag).length;
      expect((svg.match(new RegExp(`<${tag} `, 'g')) ?? []).length, tag).toBe(n);
    }
  });
});

describe('shapeElements: editor classes and gloss (R45)', () => {
  const cls = (x: Shape) => shapeElements(x).map((e) => e.attrs.class);
  const bead: Shape = { t: 'bead', r: 0, h: 0, xMm: 0, yMm: 0, wMm: 1.6, hMm: 1.3, fill: '#fff' };

  it('adds a class per shape kind', () => {
    expect(cls(bead)).toEqual(['bs-bead']);
    expect(cls({ ...bead, mark: 'floating' })).toEqual(['bs-bead', undefined]);
    expect(cls({ t: 'slot', r: 0, h: 0, xMm: 0, yMm: 0, wMm: 1.6, hMm: 1.3 })).toEqual([
      'bs-slot',
      'bs-slot',
    ]);
    const text = { t: 'text', x: 0, y: 0, text: '3', size: 1, anchor: 'end' } as const;
    expect(cls({ ...text, role: 'rowNumber' })).toEqual(['bs-text']);
    expect(cls({ ...text, role: 'ladder' })).toEqual(['bs-text bs-ladder']);
    expect(cls({ t: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#fff', role: 'ladder' })).toEqual([
      'bs-ladder',
    ]);
    expect(cls({ t: 'circle', cx: 0, cy: 0, r: 1, stroke: '#000', role: 'loop' })).toEqual([
      'bs-loop',
    ]);
  });

  it('gives every bead, slot, text, ladder and loop of a full scene its class', () => {
    const s = scene(fromRowsJson(liten));
    const first = sceneShapes(s)
      .filter((x) => x.t !== 'marker' && x.t !== 'line')
      .flatMap((x) => shapeElements(x).filter((e) => !e.attrs['data-mark']))
      .map((e) => String(e.attrs.class).split(' ')[0]);
    expect(new Set(first)).toEqual(new Set(['bs-bead', 'bs-ladder', 'bs-text', 'bs-loop']));
  });

  it('adds a gloss rect over each bead only when asked, under the mark', () => {
    expect(shapeElements(bead)).toHaveLength(1);
    const els = shapeElements({ ...bead, mark: 'floating' }, 'h', 'g');
    expect(els.map((e) => e.attrs.class)).toEqual(['bs-bead', 'bs-gloss', undefined]);
    const [base, gloss] = els;
    expect(gloss?.attrs.fill).toBe('url(#g)');
    expect(gloss?.attrs['pointer-events']).toBe('none');
    expect(gloss?.attrs['data-bead']).toBeUndefined();
    for (const k of ['x', 'y', 'width', 'height', 'rx'])
      expect(gloss?.attrs[k]).toBe(base?.attrs[k]);
  });

  it('gives segments markers bs-marker and alert markers no class', () => {
    const m = { t: 'marker', x: 0, y: 0, size: 1, r: 0 } as const;
    const alert = shapeElements({ ...m, kind: 'alert' });
    const seg = shapeElements({ ...m, kind: 'segments', value: 2 });
    expect(alert.length).toBeGreaterThan(0);
    expect(alert.every((e) => e.attrs.class === undefined)).toBe(true);
    expect(seg.length).toBeGreaterThan(0);
    expect(seg.every((e) => e.attrs.class === 'bs-marker')).toBe(true);
  });

  it('rounds editor slots like glossy beads, without a gloss rect', () => {
    const slot: Shape = { t: 'slot', r: 0, h: 0, xMm: 0, yMm: 0, wMm: 1.6, hMm: 1.3 };
    const els = shapeElements(slot, 'h', 'g');
    expect(els.map((e) => e.attrs.class)).toEqual(['bs-slot', 'bs-slot']);
    expect(els[0]?.attrs.rx).toBeCloseTo(0.18 * 1.3, 3);
    expect(shapeElements(slot)[0]?.attrs.rx).toBeCloseTo(0.28 * 1.3, 3);
  });

  it('rounds glossy beads by 18 % of the bead height; plain beads are unchanged', () => {
    expect(shapeElements(bead, 'h', 'g')[0]?.attrs.rx).toBeCloseTo(0.18 * 1.3, 3);
    expect(shapeElements(bead)[0]?.attrs.rx).toBeCloseTo(0.28 * 1.3, 3);
  });
});

describe('scene style (PDF-safe)', () => {
  it('uses only opaque #rrggbb colours', () => {
    const colours = Object.values(SCENE_STYLE).filter(
      (v) => typeof v === 'string' && v.startsWith('#'),
    );
    expect(colours.length).toBeGreaterThan(5);
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('row memoisation', () => {
  it('reuses rows whose cells, marks and layout are unchanged', () => {
    const p = fromRowsJson(liten);
    const s1 = diagramScene(p, analyse(p), ALL);
    const cells = p.cells.map((row, r) => (r === 5 ? row.map(() => 'K') : row));
    const q = { ...p, cells };
    const s2 = diagramScene(q, analyse(q), ALL, s1);
    expect(s2.rows[4]).toBe(s1.rows[4]);
    expect(s2.rows[5]).not.toBe(s1.rows[5]);
    expect(s2.rows[6]).toBe(s1.rows[6]);
    expect(sceneShapes(s2)).toEqual(sceneShapes(diagramScene(q, analyse(q), ALL)));
  });

  it('reuses background and overlay arrays when their content is unchanged', () => {
    const p = fromRowsJson(liten);
    const s1 = diagramScene(p, analyse(p), ALL);
    const q = { ...p, cells: p.cells.map((row, r) => (r === 5 ? row.map(() => 'K') : row)) };
    const s2 = diagramScene(q, analyse(q), ALL, s1);
    expect(s2.overlay).toBe(s1.overlay);
    expect(s2.background).toBe(s1.background);
    const s3 = diagramScene(q, analyse(q), { ...ALL, ladderLabel: 'S' }, s2);
    expect(s3.overlay).not.toBe(s2.overlay);
  });

  it('rebuilds rows when the palette, marks or options change', () => {
    const p = shaped(['KKK', 'K.', '...', '.K']);
    const s1 = diagramScene(p, analyse(p), ALL);
    const fixed = { ...p, cells: p.cells.map((row, r) => (r === 2 ? ['K', 'K', 'K'] : row)) };
    const s2 = diagramScene(fixed, analyse(fixed), ALL, s1);
    expect(s2.rows[3]).not.toBe(s1.rows[3]);
    const pal = { ...p, palette: [{ id: 'K', hex: '#ff0000' }] };
    expect(diagramScene(pal, analyse(pal), ALL, s1).rows[0]).not.toBe(s1.rows[0]);
    expect(diagramScene(p, analyse(p), { ...ALL, slots: false }, s1).rows[0]).not.toBe(s1.rows[0]);
  });
});

describe('cellsAlong', () => {
  it('returns every distinct cell crossed between two points, in order', () => {
    const p = fromRowsJson(liten);
    const cells = cellsAlong(p, { x: 0.8, y: 0.65 }, { x: 11 * 1.6 - 0.8, y: 0.65 });
    expect(cells.map((c) => c.h)).toEqual(Array.from({ length: 11 }, (_, i) => 2 * i));
    expect(cells.every((c) => c.r === 0)).toBe(true);
  });

  it('skips points off the lattice and handles a zero-length segment', () => {
    const p = fromRowsJson(liten);
    expect(cellsAlong(p, { x: -5, y: 0.65 }, { x: 0.8, y: 0.65 })).toEqual([{ r: 0, h: 0 }]);
    expect(cellsAlong(p, { x: 0.8, y: 0.65 }, { x: 0.8, y: 0.65 })).toEqual([{ r: 0, h: 0 }]);
  });
});
