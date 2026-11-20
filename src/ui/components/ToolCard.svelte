<script lang="ts">
  import { railTools } from '../state/rail';
  import { paletteRowLabels } from '../state/palette';
  import type { EditorStore } from '../state/editor.svelte';
  import RingPanel from './RingPanel.svelte';

  /** Floating tool card: "{tool} · {hint}" and the current colour; the Ring options for Ring (R46). */
  let { editor }: { editor: EditorStore } = $props();

  const tool = $derived(railTools('shaped').find((t) => t.id === editor.tool));
  const entry = $derived(editor.pattern.palette.find((e) => e.id === editor.color));
  const labels = $derived(entry ? paletteRowLabels(entry, editor.locale) : undefined);
</script>

<section class="float card" class:ring={editor.tool === 'ring'} aria-labelledby="tool-card-title">
  <h2 id="tool-card-title">
    <span class="b">{tool ? editor.t(tool.label) : ''}</span>
    {#if tool}<span class="muted">· {editor.t(tool.hint)}</span>{/if}
  </h2>
  {#if editor.tool === 'ring'}
    <RingPanel {editor} />
  {:else if entry && labels}
    <div class="colour" role="group" aria-label={editor.t('palette.currentColour')}>
      <span class="sw s" style:--c={entry.hex}></span>
      <span class="name">{labels.name}</span>
      {#if labels.db}<span class="muted db">{labels.db}</span>{/if}
    </div>
  {/if}
</section>

<style>
  .card {
    width: 196px;
    padding: 12px 14px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card.ring {
    width: 280px;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 400;
  }
  .b {
    font-weight: 650;
  }
  .colour {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .db {
    font-size: 12px;
  }
</style>
