<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import type { Locale } from '../../core';
  import Icon from '../components/Icon.svelte';
  import type { EditorStore } from '../state/editor.svelte';
  import { exportPdf, floatingIssue } from '../state/export';
  import {
    canInlinePdf,
    createPdfPreview,
    printPreview,
    type PreviewState,
  } from '../state/pdf-preview';
  import type { ViewNav } from '../state/route';
  import { download } from '../storage';

  /** "Skriv ut mönster" (`#/print`, SPEC R54): options, live PDF preview, download. */
  let { editor, nav }: { editor: EditorStore; nav: ViewNav } = $props();

  const LOCALES: { id: Locale; label: string }[] = [
    { id: 'sv', label: 'Svenska' },
    { id: 'en', label: 'English' },
  ];
  const inline = canInlinePdf(navigator);
  const phone = new MediaQuery('(max-width: 599px)', false);

  let locale = $state<Locale>(untrack(() => editor.locale));
  let realSize = $state(true);
  let busy = $state(false);
  let downloadError = $state<string | null>(null);
  let preview = $state<PreviewState>({ status: 'loading' });
  let frame = $state<HTMLIFrameElement>();
  let gone = false;

  const issue = $derived(floatingIssue(editor.checklist));
  const title = $derived(editor.pattern.title || editor.t('shell.untitled'));
  const error = $derived(downloadError ?? (preview.status === 'error' ? preview.error : null));
  const calloutParts = $derived(editor.t('print.calloutBody').split('**'));

  const pdf = createPdfPreview({
    render: async (choice) => {
      const { renderPdf } = await import('../../export-pdf');
      return (await exportPdf(editor.pattern, editor.analysis, choice, renderPdf)).bytes;
    },
    createUrl: (bytes) =>
      URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/pdf' })),
    revokeUrl: (u) => URL.revokeObjectURL(u),
    onChange: (s) => (preview = s),
  });

  $effect(() => {
    pdf.request({ locale, realSize });
  });

  onMount(() => () => {
    gone = true;
    pdf.dispose();
  });

  async function save(): Promise<void> {
    busy = true;
    downloadError = null;
    try {
      const { renderPdf } = await import('../../export-pdf');
      const out = await exportPdf(editor.pattern, editor.analysis, { locale, realSize }, renderPdf);
      if (!gone) download(out.name, out.bytes, 'application/pdf');
    } catch (e) {
      downloadError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  function fixFirst(): void {
    editor.requestShowWarning('floating');
    nav.leave();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') nav.leave();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="view" data-view="print">
  <header>
    <button type="button" class="btn ghost" onclick={() => nav.leave()}>
      <Icon name="chevron-left" /><span class:sr-only={phone.current}>
        {editor.t('shell.backToPattern')}
      </span>
    </button>
    <h1 tabindex="-1">{editor.t('shell.view.print')}</h1>
    <span class="pill">{title}</span>
    <span class="grow"></span>
    {#if inline}
      <button
        type="button"
        class="btn"
        disabled={!preview.url || preview.status === 'loading'}
        onclick={() => preview.url && printPreview(frame?.contentWindow ?? null, preview.url, open)}
      >
        <Icon name="print" /><span class:sr-only={phone.current}>{editor.t('print.print')}</span>
      </button>
    {/if}
    <button
      type="button"
      class="btn primary"
      data-testid="download-pdf"
      disabled={busy}
      onclick={save}
    >
      <Icon name="download" />{editor.t(busy ? 'ui.exporting' : 'print.download')}
    </button>
  </header>

  <aside>
    <section>
      <h2>{editor.t('print.language')}</h2>
      <div class="seg lang" role="radiogroup" data-testid="pdf-locale" data-value={locale}>
        {#each LOCALES as l (l.id)}
          <button
            type="button"
            role="radio"
            aria-checked={locale === l.id}
            onclick={() => (locale = l.id)}
          >
            {l.label}
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2>{editor.t('print.what')}</h2>
      <label class="ck">
        <input type="checkbox" class="check" bind:checked={realSize} />
        <span>
          <b>{editor.t('print.realSize')}</b>
          <small>{editor.t('print.realSizeHint')}</small>
        </span>
      </label>
    </section>

    <div class="grow"></div>

    <div class="call">
      <Icon name="ruler" />
      <div>
        <b>{editor.t('print.calloutTitle')}</b>
        <p>
          {#each calloutParts as part, i (i)}{#if i % 2}<b>{part}</b>{:else}{part}{/if}{/each}
        </p>
      </div>
    </div>

    {#if issue}
      <div class="issue" role="status">
        <Icon name="alert" size={18} />
        <span class="grow">{editor.t('print.floating', issue)}</span>
        <button type="button" class="btn sm" onclick={fixFirst}>
          {editor.t('print.fixFirst')}
        </button>
      </div>
    {/if}
  </aside>

  <main>
    {#if error}
      <p class="err" role="alert">{editor.t('banner.exportError', { error })}</p>
    {/if}
    {#if preview.url && inline}
      {#key preview.url}
        <iframe bind:this={frame} src={preview.url} title={editor.t('print.preview')}></iframe>
      {/key}
    {:else if preview.url}
      <div class="card summary">
        <b>{title}</b>
        <span class="muted">
          {editor.t('print.summary', {
            n: preview.pages ?? 0,
            kb: Math.max(1, Math.round((preview.bytes ?? 0) / 1024)),
          })}
        </span>
        <a class="btn" href={preview.url} target="_blank" rel="noopener">
          {editor.t('print.open')}
        </a>
      </div>
    {/if}
    {#if preview.status === 'loading'}
      <div class="updating" role="status">
        <span class="pill">{editor.t('print.updating')}</span>
      </div>
    {/if}
  </main>
</div>

<style>
  .view {
    display: grid;
    grid-template: 64px 1fr / 380px 1fr;
    height: 100dvh;
    background: var(--bg);
  }
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 17px;
    letter-spacing: -0.01em;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  aside {
    background: var(--surface);
    border-right: 1px solid var(--line);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 650;
  }
  .lang {
    display: flex;
  }
  .lang > * {
    flex: 1;
  }
  .ck {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 7px 0;
    cursor: pointer;
  }
  .ck span {
    display: flex;
    flex-direction: column;
  }
  .ck b {
    font-weight: 600;
  }
  small {
    font-size: 12px;
    color: var(--muted);
  }
  .call {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-radius: 12px;
    background: var(--warn-soft);
  }
  .call :global(svg) {
    color: var(--warn);
    flex: none;
  }
  .call p {
    margin: 2px 0 0;
    font-size: 12px;
  }
  .issue {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    font-size: 12px;
  }
  .issue :global(svg) {
    color: var(--warn);
    flex: none;
  }
  main {
    position: relative;
    background: var(--surface-2);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 22px 28px 0;
    overflow: hidden;
  }
  iframe {
    width: 100%;
    height: 100%;
    max-width: 900px;
    border: 0;
    background: var(--paper);
    border-radius: 3px 3px 0 0;
    box-shadow: var(--shadow);
  }
  .summary {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 20px;
  }
  .updating {
    position: absolute;
    top: 16px;
    right: 24px;
  }
  .err {
    position: absolute;
    top: 12px;
    left: 24px;
    margin: 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--danger-soft);
    color: var(--danger);
  }
  .muted {
    color: var(--muted);
  }
  @media (max-width: 1023px) {
    .view {
      grid-template: 64px auto minmax(70dvh, 1fr) / minmax(0, 1fr);
      height: auto;
      min-height: 100dvh;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 3;
    }
    aside {
      border-right: 0;
      border-bottom: 1px solid var(--line);
      padding: 20px;
      gap: 16px;
    }
    aside > .grow {
      display: none;
    }
    main {
      padding: 12px 12px 0;
    }
  }
  @media (max-width: 599px) {
    header {
      gap: 6px;
      padding: 0 8px;
    }
    header .pill {
      display: none;
    }
    h1 {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    aside {
      padding: 16px;
    }
  }
</style>
