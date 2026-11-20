import type { PdfChoice } from './export';

/** What the preview pane shows; `url` is the last good result, kept while a new one renders. */
export interface PreviewState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly url?: string;
  readonly bytes?: number;
  readonly pages?: number;
  readonly error?: string;
}

/** Injected effects of the preview (renderer, blob URLs, state sink, timers). */
export interface PreviewDeps {
  readonly render: (choice: PdfChoice) => Promise<Uint8Array>;
  readonly createUrl: (bytes: Uint8Array) => string;
  readonly revokeUrl: (url: string) => void;
  readonly onChange: (state: PreviewState) => void;
  readonly delayMs?: number;
}

/** Debounced PDF preview (SPEC R54). */
export interface PdfPreview {
  /** Schedules a render of `choice`; older pending or in-flight renders are dropped. */
  request(choice: PdfChoice): void;
  /** Cancels everything and revokes the current blob URL. */
  dispose(): void;
}

/** Number of pages in a jsPDF document (counts `/Type /Page` objects). */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes);
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/** Whether the browser shows PDFs inline (false on e.g. phones; unknown counts as true). */
export const canInlinePdf = (nav: { pdfViewerEnabled?: boolean }): boolean =>
  nav.pdfViewerEnabled !== false;

/** Prints through the preview frame; opens `url` in a new tab when that is not possible. */
export function printPreview(
  frame: { focus(): void; print(): void } | null,
  url: string,
  open: (url: string, target: string) => unknown,
): void {
  try {
    if (!frame) throw new Error('no frame');
    frame.focus();
    frame.print();
  } catch {
    open(url, '_blank');
  }
}

/** Creates the debounce / stale-drop / revoke logic of the print page preview. */
export function createPdfPreview(deps: PreviewDeps): PdfPreview {
  const delay = deps.delayMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ticket = 0;
  let url: string | undefined;
  let last: Omit<PreviewState, 'status' | 'error'> = {};
  let disposed = false;

  const run = async (choice: PdfChoice, mine: number): Promise<void> => {
    try {
      const bytes = await deps.render(choice);
      if (disposed || mine !== ticket) return;
      const next = deps.createUrl(bytes);
      if (url) deps.revokeUrl(url);
      url = next;
      last = { url, bytes: bytes.length, pages: pdfPageCount(bytes) };
      deps.onChange({ status: 'ready', ...last });
    } catch (e) {
      if (disposed || mine !== ticket) return;
      deps.onChange({
        status: 'error',
        ...last,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return {
    request(choice) {
      if (disposed) return;
      if (timer !== null) clearTimeout(timer);
      const mine = ++ticket;
      deps.onChange({ status: 'loading', ...last });
      timer = setTimeout(() => {
        timer = null;
        void run(choice, mine);
      }, delay);
    },
    dispose() {
      disposed = true;
      ticket++;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (url) deps.revokeUrl(url);
      url = undefined;
    },
  };
}
