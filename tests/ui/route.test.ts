import { describe, expect, it } from 'vitest';
import {
  createRouter,
  hashOf,
  leaveAction,
  parseRoute,
  type Route,
  type RouteCtx,
} from '../../src/ui/state/route';

const ctx = (c: Partial<RouteCtx> = {}): RouteCtx => ({
  hasImage: false,
  hasPattern: true,
  firstRun: false,
  ...c,
});

describe('hash <-> route', () => {
  it.each<[string, Route]>([
    ['#/', 'editor'],
    ['#/new', 'new'],
    ['#/import', 'import'],
    ['#/print', 'print'],
  ])('%s is %s and back', (hash, route) => {
    expect(parseRoute(hash, ctx({ hasImage: true }))).toEqual({ route, replace: false });
    expect(hashOf(route)).toBe(hash);
  });

  it('treats an empty hash as the editor without rewriting it', () => {
    expect(parseRoute('', ctx())).toEqual({ route: 'editor', replace: false });
    expect(parseRoute('#', ctx())).toEqual({ route: 'editor', replace: false });
  });

  it('replaces unknown hashes with the editor', () => {
    expect(parseRoute('#/nope', ctx())).toEqual({ route: 'editor', replace: true });
  });
});

describe('guards (R44)', () => {
  it('sends #/import without a decoded image (e.g. after reload) to the editor', () => {
    expect(parseRoute('#/import', ctx())).toEqual({ route: 'editor', replace: true });
  });

  it('sends #/print with an empty pattern to the editor', () => {
    expect(parseRoute('#/print', ctx({ hasPattern: false }))).toEqual({
      route: 'editor',
      replace: true,
    });
  });

  it('keeps a reloaded #/print with a pattern and a reloaded #/new', () => {
    expect(parseRoute('#/print', ctx())).toEqual({ route: 'print', replace: false });
    expect(parseRoute('#/new', ctx())).toEqual({ route: 'new', replace: false });
  });

  it('opens the start page on the first run', () => {
    expect(parseRoute('', ctx({ firstRun: true }))).toEqual({ route: 'new', replace: true });
    expect(parseRoute('#/', ctx({ firstRun: true }))).toEqual({ route: 'new', replace: true });
    expect(parseRoute('#/import', ctx({ firstRun: true }))).toEqual({
      route: 'new',
      replace: true,
    });
  });
});

describe('leaveAction', () => {
  it('goes back when the view was entered from the editor in this session', () => {
    expect(leaveAction({ enteredFrom: 'editor' })).toBe('back');
    expect(leaveAction({ enteredFrom: null })).toBe('replace');
    expect(leaveAction({ enteredFrom: 'new' })).toBe('replace');
  });

  it('goes back to another destination it was entered from', () => {
    expect(leaveAction({ enteredFrom: 'new' }, 'new')).toBe('back');
    expect(leaveAction({ enteredFrom: 'editor' }, 'new')).toBe('replace');
  });
});

describe('router', () => {
  function setup(initial: string, c: Partial<RouteCtx> = {}) {
    const log: string[] = [];
    let hash = initial;
    let state = ctx(c);
    const router = createRouter({
      getHash: () => hash,
      push: (h) => (log.push(`push ${h}`), (hash = h)),
      replace: (h) => (log.push(`replace ${h}`), (hash = h)),
      back: () => log.push('back'),
      ctx: () => state,
    });
    return {
      router,
      log,
      setHash: (h: string) => (hash = h),
      setCtx: (n: Partial<RouteCtx>) => (state = { ...state, ...n }),
    };
  }

  it('resolves the initial route and rewrites a guarded hash', () => {
    const { router, log } = setup('#/import');
    expect(router.sync()).toBe('editor');
    expect(log).toEqual(['replace #/']);
  });

  it('pushes on go and goes back on leave when entered from the editor', () => {
    const { router, log } = setup('#/');
    router.sync();
    router.go('print');
    expect(router.route).toBe('print');
    router.leave();
    expect(log).toEqual(['push #/print', 'back']);
  });

  it('replaces on leave when the view was not entered from the editor', () => {
    const { router, log } = setup('#/print');
    router.sync();
    router.leave();
    expect(log).toEqual(['replace #/']);
    expect(router.route).toBe('editor');
  });

  it('follows browser navigation through sync', () => {
    const { router, setHash } = setup('#/');
    router.sync();
    router.go('new');
    setHash('#/');
    expect(router.sync()).toBe('editor');
  });

  it('remembers the start page as origin of an import', () => {
    const { router, log, setCtx } = setup('#/new');
    router.sync();
    setCtx({ hasImage: true });
    router.go('import');
    router.leave('new');
    expect(log).toEqual(['push #/import', 'back']);
  });
});
