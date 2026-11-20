<script lang="ts">
  import type { EditorStore } from '../state/editor.svelte';
  import { fitView, toggleRealSize, zoomBy, zoomPercent, type View } from '../state/zoom';
  import Icon from './Icon.svelte';

  /**
   * Floating zoom bar (SPEC R46): −, zoom %, +, "Visa allt", "Verklig storlek"; `stack` is the
   * tablet's vertical +, −, real-size stack (R51).
   */
  let {
    editor,
    fit,
    stack = false,
  }: { editor: EditorStore; fit: number; stack?: boolean } = $props();

  const view = $derived<View>({
    zoom: editor.settings.zoom,
    realSize: editor.settings.realSize,
  });
  const set = (v: View): void => editor.setView(v.zoom, v.realSize);
</script>

{#if stack}
  <div
    class="stack float"
    role="toolbar"
    aria-orientation="vertical"
    aria-label={editor.t('size.zoom')}
  >
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('ui.zoomIn')}
      onclick={() => set(zoomBy(view, fit, 1.25))}
    >
      <Icon name="plus" />
    </button>
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('ui.zoomOut')}
      onclick={() => set(zoomBy(view, fit, 1 / 1.25))}
    >
      <Icon name="minus" />
    </button>
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('size.realSize')}
      aria-pressed={view.realSize}
      onclick={() => set(toggleRealSize(view))}
    >
      <Icon name="ruler" />
    </button>
  </div>
{:else}<div class="zoom float" role="toolbar" aria-label={editor.t('size.zoom')}>
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('ui.zoomOut')}
      title={editor.t('ui.zoomOut')}
      onclick={() => set(zoomBy(view, fit, 1 / 1.25))}
    >
      <Icon name="minus" size={18} />
    </button>
    <span class="pct num" data-testid="zoom-percent">{zoomPercent(view, fit)} %</span>
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('ui.zoomIn')}
      title={editor.t('ui.zoomIn')}
      onclick={() => set(zoomBy(view, fit, 1.25))}
    >
      <Icon name="plus" size={18} />
    </button>
    <span class="vr" aria-hidden="true"></span>
    <button
      type="button"
      class="btn ghost"
      aria-pressed={view.zoom === 'fit' && !view.realSize}
      onclick={() => set(fitView())}
    >
      {editor.t('size.zoomFit')}
    </button>
    <button
      type="button"
      class="btn ghost"
      aria-pressed={view.realSize}
      onclick={() => set(toggleRealSize(view))}
    >
      <Icon name="ruler" size={16} />{editor.t('size.realSize')}
    </button>
  </div>{/if}

<style>
  .zoom {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
  }
  .pct {
    width: 52px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
  }
  .vr {
    width: 1px;
    height: 20px;
    background: var(--line);
    margin: 0 4px;
  }
  .btn {
    font-size: 13px;
  }
  .btn[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
