import { describe, expect, it } from 'vitest';
import {
  gestureStep,
  initGesture,
  type GestureInput,
  type GestureOutput,
  type GestureState,
  type PointerKind,
} from '../../src/ui/state/gesture';

type Ev = [GestureInput['type'], number, number, number, PointerKind?];

/** Runs synthetic pointer events (`[type, id, x, y, kind = touch]`) at displayed scale `scale`. */
function run(events: Ev[], scale = 4, s: GestureState = initGesture()) {
  const out: GestureOutput[] = [];
  for (const [type, id, x, y, kind = 'touch'] of events) {
    const r = gestureStep(s, { type, id, kind, x, y }, scale);
    s = r.state;
    out.push(...r.out);
  }
  return { state: s, out };
}

const kinds = (o: GestureOutput[]): string[] => o.map((x) => x.kind);

describe('gestureStep', () => {
  it('one touch paints: down, move, end', () => {
    const { out } = run([
      ['down', 1, 10, 10],
      ['move', 1, 20, 10],
      ['up', 1, 20, 10],
    ]);
    expect(out).toEqual([
      { kind: 'down', id: 1, x: 10, y: 10 },
      { kind: 'move', id: 1, x: 20, y: 10 },
      { kind: 'end', id: 1, released: true },
    ]);
  });

  it('pointercancel ends without release', () => {
    const { out } = run([
      ['down', 1, 10, 10],
      ['cancel', 1, 10, 10],
    ]);
    expect(out.at(-1)).toEqual({ kind: 'end', id: 1, released: false });
  });

  it('a second touch during a stroke cancels it and starts a pinch', () => {
    const { out, state } = run([
      ['down', 1, 0, 0],
      ['move', 1, 10, 0],
      ['down', 2, 100, 0],
    ]);
    expect(kinds(out)).toEqual(['down', 'move', 'cancel', 'pinchStart']);
    expect(out.at(-1)).toEqual({ kind: 'pinchStart', mid: { x: 55, y: 0 } });
    expect(state.tool).toBeNull();
  });

  it('pinch scale follows the distance ratio, anchored at the start midpoint', () => {
    const { out } = run(
      [
        ['down', 1, 0, 0],
        ['down', 2, 100, 0],
        ['move', 2, 200, 0],
      ],
      4,
    );
    expect(out.at(-1)).toEqual({ kind: 'pinch', scale: 8, mid: { x: 100, y: 0 } });
  });

  it('pinch scale is clamped to 1–80 px/mm', () => {
    const big = run([
      ['down', 1, 0, 0],
      ['down', 2, 10, 0],
      ['move', 2, 1000, 0],
    ]);
    expect(big.out.at(-1)).toMatchObject({ kind: 'pinch', scale: 80 });
    const small = run([
      ['down', 1, 0, 0],
      ['down', 2, 1000, 0],
      ['move', 2, 10, 0],
    ]);
    expect(small.out.at(-1)).toMatchObject({ kind: 'pinch', scale: 1 });
  });

  it('two fingers moving together pan by the midpoint delta at the same scale', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 2, 100, 0],
      ['move', 1, 30, 40],
      ['move', 2, 130, 40],
    ]);
    const last = out.at(-1);
    expect(last).toEqual({ kind: 'pinch', scale: 4, mid: { x: 80, y: 40 } });
  });

  it('does not paint again until all pointers are up', () => {
    const { out, state } = run([
      ['down', 1, 0, 0],
      ['down', 2, 100, 0],
      ['up', 2, 100, 0],
      ['move', 1, 5, 5],
      ['down', 3, 50, 50],
      ['up', 3, 50, 50],
      ['up', 1, 5, 5],
    ]);
    expect(kinds(out)).toEqual([
      'down',
      'cancel',
      'pinchStart',
      'pinchEnd',
      'pinchStart',
      'pinchEnd',
    ]);
    expect(state).toEqual(initGesture());
    const next = gestureStep(state, { type: 'down', id: 4, kind: 'touch', x: 1, y: 1 }, 4);
    expect(next.out).toEqual([{ kind: 'down', id: 4, x: 1, y: 1 }]);
  });

  it('a third finger is ignored by the pinch', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 2, 100, 0],
      ['down', 3, 500, 500],
      ['move', 3, 600, 600],
    ]);
    expect(kinds(out)).toEqual(['down', 'cancel', 'pinchStart']);
  });

  it('mouse and pen are unaffected by touches and never pinch', () => {
    for (const kind of ['mouse', 'pen'] as const) {
      const { out } = run([
        ['down', 1, 0, 0, kind],
        ['move', 1, 5, 0, kind],
        ['down', 2, 100, 0, 'touch'],
        ['move', 1, 6, 0, kind],
        ['up', 1, 6, 0, kind],
      ]);
      expect(kinds(out)).toEqual(['down', 'move', 'move', 'end']);
    }
  });

  it('a second mouse button press during a stroke is ignored', () => {
    const { out } = run([
      ['down', 1, 0, 0, 'mouse'],
      ['down', 1, 0, 0, 'mouse'],
      ['up', 1, 0, 0, 'mouse'],
    ]);
    expect(kinds(out)).toEqual(['down', 'end']);
  });

  it('ring placement: a second finger cancels before release', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 2, 50, 0],
      ['up', 1, 0, 0],
      ['up', 2, 50, 0],
    ]);
    expect(kinds(out)).toEqual(['down', 'cancel', 'pinchStart', 'pinchEnd']);
    expect(out).not.toContainEqual(expect.objectContaining({ kind: 'end' }));
  });

  it('a pen takes over from a touch stroke; touches are ignored while it is down', () => {
    const { out, state } = run([
      ['down', 1, 0, 0],
      ['move', 1, 5, 0],
      ['down', 7, 50, 50, 'pen'],
      ['move', 1, 9, 0],
      ['down', 2, 100, 0],
      ['move', 2, 120, 0],
      ['move', 7, 60, 50, 'pen'],
      ['up', 7, 60, 50, 'pen'],
      ['up', 1, 9, 0],
      ['up', 2, 120, 0],
    ]);
    expect(out).toEqual([
      { kind: 'down', id: 1, x: 0, y: 0 },
      { kind: 'move', id: 1, x: 5, y: 0 },
      { kind: 'cancel' },
      { kind: 'down', id: 7, x: 50, y: 50 },
      { kind: 'move', id: 7, x: 60, y: 50 },
      { kind: 'end', id: 7, released: true },
    ]);
    expect(state).toEqual(initGesture());
  });

  it('a pen ends a pinch and takes over', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 2, 100, 0],
      ['down', 7, 50, 50, 'pen'],
      ['move', 2, 200, 0],
    ]);
    expect(kinds(out)).toEqual(['down', 'cancel', 'pinchStart', 'pinchEnd', 'down']);
  });

  it('a mouse press while a touch paints is ignored, the touch keeps painting', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 9, 40, 40, 'mouse'],
      ['move', 9, 45, 40, 'mouse'],
      ['up', 9, 45, 40, 'mouse'],
      ['move', 1, 5, 0],
      ['up', 1, 5, 0],
    ]);
    expect(kinds(out)).toEqual(['down', 'move', 'end']);
    expect(out.every((o) => !('id' in o) || o.id === 1)).toBe(true);
  });

  it('a mouse press while touches are down but idle is ignored', () => {
    const { out } = run([
      ['down', 1, 0, 0],
      ['down', 2, 100, 0],
      ['down', 9, 40, 40, 'mouse'],
    ]);
    expect(kinds(out)).toEqual(['down', 'cancel', 'pinchStart']);
  });

  it('moves of foreign pointers emit nothing', () => {
    const { out } = run([['move', 9, 1, 1]]);
    expect(out).toEqual([]);
  });
});
