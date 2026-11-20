/**
 * Build-time stand-in for jsPDF's optional html/SVG dependencies (html2canvas, dompurify,
 * canvg). The guide never uses `html()` or SVG import, so they are kept out of the bundle.
 */
export default function unavailable() {
  throw new Error('Not bundled: jsPDF html/SVG plugins are unused.');
}
