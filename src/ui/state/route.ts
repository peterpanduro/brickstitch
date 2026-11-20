import type { ImportTarget } from './import-wizard';

/** The four views (SPEC R44). */
export type Route = 'editor' | 'new' | 'import' | 'print';

/** What the route guards need to know. */
export interface RouteCtx {
  /** A decoded image is in memory (it is lost on reload). */
  readonly hasImage: boolean;
  /** The pattern is not empty (`analysis.instructions` is present; absent when empty). */
  readonly hasPattern: boolean;
  /** Nothing was stored yet: the editor route opens the start page instead. */
  readonly firstRun: boolean;
}

/** A parsed hash: the route to show and whether the hash must be rewritten (`location.replace`). */
export interface ParsedRoute {
  readonly route: Route;
  readonly replace: boolean;
}

const HASHES: Readonly<Record<Route, string>> = {
  editor: '#/',
  new: '#/new',
  import: '#/import',
  print: '#/print',
};

/** Location hash of `route`. */
export const hashOf = (route: Route): string => HASHES[route];

const routeOfHash = (hash: string): Route | null => {
  if (hash === '' || hash === '#') return 'editor';
  const hit = (Object.keys(HASHES) as Route[]).find((r) => HASHES[r] === hash);
  return hit ?? null;
};

/**
 * Route for `hash` after the R44 guards: unknown → editor; `#/import` without an image →
 * editor; `#/print` with an empty pattern → editor; first run → start page. `replace` is set
 * when the shown route differs from the hash.
 */
export function parseRoute(hash: string, ctx: RouteCtx): ParsedRoute {
  const asked = routeOfHash(hash);
  let route: Route = asked ?? 'editor';
  if (route === 'import' && !ctx.hasImage) route = 'editor';
  if (route === 'print' && !ctx.hasPattern) route = 'editor';
  if (route === 'editor' && ctx.firstRun) route = 'new';
  return { route, replace: asked === null || route !== asked };
}

/**
 * How to leave a view for `to` (default the editor): `back` when the view was entered from
 * `to` in this session, so browser back never leaves the app or loops; else `replace`.
 */
export const leaveAction = (
  ctx: { readonly enteredFrom: Route | null },
  to: Route = 'editor',
): 'back' | 'replace' => (ctx.enteredFrom === to ? 'back' : 'replace');

/** Location effects and guard state injected into {@link createRouter}. */
export interface RouterDeps {
  readonly getHash: () => string;
  /** Adds a history entry (`location.hash = h`). */
  readonly push: (hash: string) => void;
  /** Rewrites the current entry (`location.replace(h)`). */
  readonly replace: (hash: string) => void;
  readonly back: () => void;
  readonly ctx: () => RouteCtx;
}

/** Hash router state: the current route plus where each view was entered from. */
export interface Router {
  readonly route: Route;
  /** Re-reads the hash (start-up and `hashchange`), applying the guards; returns the route. */
  sync(): Route;
  /** Opens `route` with a new history entry, remembering the current view as its origin. */
  go(route: Route): void;
  /** Leaves the current view for `to` (default the editor), see {@link leaveAction}. */
  leave(to?: Route): void;
}

/** Creates a {@link Router}; call `sync()` once at start-up. */
export function createRouter(d: RouterDeps): Router {
  let route: Route = 'editor';
  const entered = new Map<Route, Route>();
  return {
    get route() {
      return route;
    },
    sync() {
      const p = parseRoute(d.getHash(), d.ctx());
      if (p.replace) d.replace(hashOf(p.route));
      route = p.route;
      return route;
    },
    go(next) {
      if (next === route) return;
      entered.set(next, route);
      route = next;
      d.push(hashOf(next));
    },
    leave(to = 'editor') {
      const from = entered.get(route) ?? null;
      entered.delete(route);
      if (leaveAction({ enteredFrom: from }, to) === 'back') {
        d.back();
        return;
      }
      route = to;
      d.replace(hashOf(to));
    },
  };
}

/** Navigation handed to every view by `App.svelte` (SPEC R44). */
export interface ViewNav {
  /** Opens `route` with a history entry (e.g. editor → print). */
  go(route: Route): void;
  /** Leaves the current view for `to` (default the editor) without a new history entry. */
  leave(to?: Route): void;
  /** Decodes `file` and opens `#/import` for it; shows the open-error banner on failure. */
  openImage(file: File, target: ImportTarget): Promise<void>;
}
