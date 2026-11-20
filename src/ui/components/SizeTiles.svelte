<script lang="ts">
  import type { EditorStore } from '../state/editor.svelte';
  import { sizeTiles } from '../state/size-tiles';

  /** "Ett örhänge" tiles (SPEC R46): beads, rows and motif size in whole millimetres. */
  let { editor }: { editor: EditorStore } = $props();

  const tiles = $derived(sizeTiles(editor.pattern, editor.analysis));
  const num = (n: number): string => n.toLocaleString(editor.locale);
</script>

<section class="size" aria-labelledby="size-title">
  <h2 id="size-title">{editor.t('size.heading')}</h2>
  <dl class="stat">
    <div>
      <dt>{editor.t('size.beads', { n: tiles.beads })}</dt>
      <dd class="num">{num(tiles.beads)}</dd>
    </div>
    <div>
      <dt>{editor.t('size.rows', { n: tiles.rows })}</dt>
      <dd class="num">{num(tiles.rows)}</dd>
    </div>
    <div>
      <dt>{editor.t('size.unitMm')}</dt>
      <dd class="num">{Math.round(tiles.size.width)}×{Math.round(tiles.size.height)}</dd>
    </div>
  </dl>
</section>

<style>
  .size {
    padding: 0 16px 16px;
  }
  h2 {
    margin: 0 0 8px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.02em;
  }
  .stat {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin: 0;
  }
  .stat div {
    display: flex;
    flex-direction: column-reverse;
    padding: 10px;
    border-radius: var(--r-control);
    background: var(--surface-2);
  }
  dd {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  dt {
    font-size: 11px;
    color: var(--muted);
  }
</style>
