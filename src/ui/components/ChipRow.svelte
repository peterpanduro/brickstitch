<script lang="ts">
  import { formatMm } from '../../core';
  import { checklistPill, pillText, type Text } from '../state/checklist';
  import type { EditorStore } from '../state/editor.svelte';
  import type { Layout } from '../state/layout';
  import Icon from './Icon.svelte';

  /**
   * Floating chips over the touch canvas (SPEC R51): the checklist chip (both layouts) and, on
   * phones, the motif size chip and the "Startrad" chip in a horizontally scrolling row.
   */
  let {
    editor,
    layout,
    onChecklist,
    onSize,
    onStartRow,
  }: {
    editor: EditorStore;
    layout: Exclude<Layout, 'desktop'>;
    onChecklist: (opener: HTMLElement) => void;
    onSize: (opener: HTMLElement) => void;
    onStartRow: () => void;
  } = $props();

  const pill = $derived(checklistPill(editor.checklist));
  const text = $derived<Text>(pill ? pillText(pill) : { key: 'check.heading' });
  const size = $derived(editor.motifSizeMm);
</script>

<div class="chips {layout}">
  <button
    type="button"
    class="chip float"
    class:warn={pill?.kind === 'warn'}
    class:ok={pill?.kind === 'ok'}
    aria-haspopup="dialog"
    data-testid="checklist-chip"
    onclick={(e) => onChecklist(e.currentTarget)}
  >
    <Icon name={pill?.kind === 'ok' ? 'check' : 'alert'} size={18} />
    {editor.t(text.key, text.params)}
    <Icon name="chevron" size={14} />
  </button>
  {#if layout === 'phone'}
    <button
      type="button"
      class="chip float quiet"
      aria-haspopup="dialog"
      onclick={(e) => onSize(e.currentTarget)}
    >
      <Icon name="ruler" size={16} />
      {editor.t('size.mm', {
        w: formatMm(editor.locale, size.width),
        h: formatMm(editor.locale, size.height),
      })}
    </button>
    <button
      type="button"
      class="chip float quiet"
      disabled={editor.analysis.ladderRow === null}
      onclick={onStartRow}
    >
      <span class="lad" aria-hidden="true"></span>{editor.t('dock.startRow')}
    </button>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px;
    scrollbar-width: none;
  }
  .phone {
    gap: 6px;
  }
  .chip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-lg);
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .phone .chip {
    padding: 6px 10px;
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .ok {
    color: var(--ok);
  }
  .lad {
    width: 14px;
    height: 10px;
    border-radius: 3px;
    background: var(--ladder);
  }
</style>
