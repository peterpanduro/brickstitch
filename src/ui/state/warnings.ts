import type { Warning, WarningCode } from '../../core';

/** The `n`-th warning of `code`, wrapping around; `undefined` if there is none. */
export function warningAt(
  ws: readonly Warning[],
  code: WarningCode,
  n: number,
): Warning | undefined {
  const of = ws.filter((w) => w.code === code);
  return of.length ? of[n % of.length] : undefined;
}
