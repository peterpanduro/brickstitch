import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyse, beadTable } from '../../src/core';
import { renderPdf } from '../../src/export-pdf';
import {
  canInlinePdf,
  createPdfPreview,
  pdfPageCount,
  printPreview,
  type PreviewState,
} from '../../src/ui/state/pdf-preview';
import { fromRowsJson } from '../adapters';
import liten from '../fixtures/liten.rows.json';

const choice = (locale: 'sv' | 'en' = 'sv', realSize = true) => ({ locale, realSize });

function setup() {
  const resolvers: ((b: Uint8Array) => void)[] = [];
  const rejecters: ((e: Error) => void)[] = [];
  const render = vi.fn(
    () =>
      new Promise<Uint8Array>((res, rej) => {
        resolvers.push(res);
        rejecters.push(rej);
      }),
  );
  let n = 0;
  const createUrl = vi.fn(() => `blob:${++n}`);
  const revokeUrl = vi.fn();
  const states: PreviewState[] = [];
  const p = createPdfPreview({ render, createUrl, revokeUrl, onChange: (s) => states.push(s) });
  return { p, render, createUrl, revokeUrl, resolvers, rejecters, states };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('pdf preview', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces renders by 300 ms and renders the last choice', () => {
    const { p, render } = setup();
    p.request(choice('sv'));
    vi.advanceTimersByTime(200);
    p.request(choice('en'));
    vi.advanceTimersByTime(299);
    expect(render).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(choice('en'));
  });

  it('reports loading, then ready with a blob URL', async () => {
    const { p, resolvers, states } = setup();
    p.request(choice());
    expect(states.at(-1)?.status).toBe('loading');
    vi.advanceTimersByTime(300);
    resolvers[0]?.(new Uint8Array([1, 2]));
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'ready', url: 'blob:1' });
  });

  it('drops a stale result', async () => {
    const { p, resolvers, createUrl, states } = setup();
    p.request(choice('sv'));
    vi.advanceTimersByTime(300);
    p.request(choice('en'));
    resolvers[0]?.(new Uint8Array([1]));
    await flush();
    expect(createUrl).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe('loading');
    vi.advanceTimersByTime(300);
    resolvers[1]?.(new Uint8Array([2]));
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'ready', url: 'blob:1' });
  });

  it('keeps the previous URL while loading and revokes it on replace', async () => {
    const { p, resolvers, revokeUrl, states } = setup();
    p.request(choice('sv'));
    vi.advanceTimersByTime(300);
    resolvers[0]?.(new Uint8Array([1]));
    await flush();
    p.request(choice('en'));
    expect(states.at(-1)).toMatchObject({ status: 'loading', url: 'blob:1' });
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    resolvers[1]?.(new Uint8Array([2]));
    await flush();
    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
    expect(states.at(-1)).toMatchObject({ url: 'blob:2' });
  });

  it('revokes the current URL and ignores in-flight results on dispose', async () => {
    const { p, resolvers, revokeUrl, createUrl } = setup();
    p.request(choice());
    vi.advanceTimersByTime(300);
    resolvers[0]?.(new Uint8Array([1]));
    await flush();
    p.request(choice('en'));
    vi.advanceTimersByTime(300);
    p.dispose();
    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
    resolvers[1]?.(new Uint8Array([2]));
    await flush();
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending timer on dispose', () => {
    const { p, render } = setup();
    p.request(choice());
    p.dispose();
    vi.advanceTimersByTime(1000);
    expect(render).not.toHaveBeenCalled();
  });

  it('reports render errors', async () => {
    const { p, rejecters, states } = setup();
    p.request(choice());
    vi.advanceTimersByTime(300);
    rejecters[0]?.(new Error('boom'));
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'error', error: 'boom' });
  });

  it('keeps the last good result visible in the error state', async () => {
    const { p, resolvers, rejecters, states } = setup();
    p.request(choice('sv'));
    vi.advanceTimersByTime(300);
    resolvers[0]?.(new Uint8Array([1, 2, 3]));
    await flush();
    p.request(choice('en'));
    vi.advanceTimersByTime(300);
    rejecters[1]?.(new Error('boom'));
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'error', error: 'boom', url: 'blob:1' });
  });

  it('ignores the error of a stale render', async () => {
    const { p, rejecters, states } = setup();
    p.request(choice('sv'));
    vi.advanceTimersByTime(300);
    p.request(choice('en'));
    rejecters[0]?.(new Error('old'));
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'loading' });
    expect(states.at(-1)?.error).toBeUndefined();
  });
});

describe('pdf helpers', () => {
  it('detects an inline PDF viewer; only an explicit false disables it', () => {
    expect(canInlinePdf({ pdfViewerEnabled: true })).toBe(true);
    expect(canInlinePdf({ pdfViewerEnabled: false })).toBe(false);
    expect(canInlinePdf({})).toBe(true);
  });

  it('counts the pages of a real guide', async () => {
    const p = fromRowsJson(liten);
    const bytes = await renderPdf({
      pattern: p,
      analysis: analyse(p),
      table: beadTable(p),
      locale: 'sv',
      realSize: true,
    });
    expect(pdfPageCount(bytes)).toBeGreaterThanOrEqual(1);
  });

  it('counts /Type /Page objects but not /Type /Pages', () => {
    const raw =
      '1 0 obj << /Type /Pages /Count 2 >> 2 0 obj << /Type /Page >> 3 0 obj << /Type /Page >>';
    expect(pdfPageCount(new TextEncoder().encode(raw))).toBe(2);
  });

  it('prints through the frame, falling back to a new tab', () => {
    const print = vi.fn();
    const focus = vi.fn();
    const open = vi.fn();
    printPreview({ focus, print }, 'blob:1', open);
    expect(print).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    printPreview(null, 'blob:1', open);
    expect(open).toHaveBeenCalledWith('blob:1', '_blank');
    const bad = {
      focus,
      print: () => {
        throw new Error('x');
      },
    };
    printPreview(bad, 'blob:2', open);
    expect(open).toHaveBeenCalledWith('blob:2', '_blank');
  });
});
