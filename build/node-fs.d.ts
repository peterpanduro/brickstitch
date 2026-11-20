/** Minimal types for the two `node:fs` functions the build plugins use (no `@types/node`). */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
}
