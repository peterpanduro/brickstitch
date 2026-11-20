/**
 * Filled share of a range slider's track (0–1, as a CSS number string) for the `--fill` custom
 * property that draws the accent fill in WebKit (`app.css`; Firefox uses `::-moz-range-progress`).
 */
export function sliderFill(value: number, min: number, max: number): string {
  if (!(max > min)) return '0';
  const f = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return String(Math.round(f * 1e4) / 1e4);
}
