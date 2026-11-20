<script lang="ts" module>
  let collapsedThisSession = $state(false);
</script>

<script lang="ts">
  import {
    analyse,
    diagramScene,
    formatMm,
    type Analysis,
    type Locale,
    type Pattern,
    type Translate,
  } from '../../core';
  import { drawnLayout, motifBox, motifSizeMm, PAIR_GAP_MM, type SizeMm } from '../state/real-size';
  import Icon from './Icon.svelte';
  import SceneShapes from './SceneShapes.svelte';

  /**
   * Real-size pair (SPEC R49): title, motif size and two copies (beads and loop) in CSS mm when
   * the drawn copies fit `box`, one copy, or "För stort att visa här" with an optional
   * real-size action. `collapsible` (editor card) lets the user fold it to its title for the
   * rest of the session.
   */
  let {
    pattern,
    analysis,
    box,
    locale,
    t,
    single = false,
    collapsible = false,
    compact = false,
    onShowRealSize,
  }: {
    pattern: Pattern;
    /** Analysis of `pattern` when already known (saves a recomputation). */
    analysis?: Analysis;
    box: SizeMm;
    locale: Locale;
    t: Translate;
    /** At most one copy (import inset). */
    single?: boolean;
    collapsible?: boolean;
    /** Tablet card (R51): the drawing first, title and size stacked below it. */
    compact?: boolean;
    onShowRealSize?: () => void;
  } = $props();

  const id = $props.id();
  const a = $derived(analysis ?? analyse(pattern));
  const scene = $derived(diagramScene(pattern, a, { loop: true }));
  const size = $derived(motifSizeMm(pattern, a));
  const vb = $derived(motifBox(scene));
  const fit = $derived(drawnLayout(scene, box) ?? 'none');
  const layout = $derived(single && fit === 'pair' ? 'single' : fit);
  const open = $derived(!collapsible || !collapsedThisSession);
</script>

<section class="real float" class:compact aria-labelledby="{id}-title">
  <header>
    <Icon name="ruler" size={18} />
    <h2 id="{id}-title">
      {#if collapsible}
        <button
          type="button"
          class="toggle"
          aria-expanded={open}
          onclick={() => (collapsedThisSession = !collapsedThisSession)}
        >
          {t('size.realSize')}<Icon name="chevron" size={14} />
        </button>
      {:else}
        {t('size.realSize')}
      {/if}
    </h2>
    <span class="muted num mm">
      {t('size.mm', { w: formatMm(locale, size.width), h: formatMm(locale, size.height) })}
    </span>
  </header>
  {#if open && vb && layout !== 'none'}
    <div class="pair" aria-hidden="true" style:gap="{PAIR_GAP_MM}mm">
      {#each layout === 'pair' ? [0, 1] : [0] as i (i)}
        <svg
          width="{vb.width}mm"
          height="{vb.height}mm"
          viewBox="{vb.x} {vb.y} {vb.width} {vb.height}"
        >
          <SceneShapes {scene} hatchId="{id}-hatch-{i}" bare />
        </svg>
      {/each}
    </div>
  {:else if open && vb}
    <p class="muted">{t('size.tooBig')}</p>
    {#if onShowRealSize}
      <button type="button" class="btn sm" onclick={onShowRealSize}>
        {t('size.showRealSize')}
      </button>
    {/if}
  {/if}
</section>

<style>
  .real {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
  }
  h2 {
    margin: 0;
    flex: 1;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0;
  }
  .mm {
    font-size: 12px;
    white-space: nowrap;
  }
  .toggle {
    display: inline-flex;
    white-space: nowrap;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .toggle:hover:not(:disabled) {
    background: none;
  }
  .toggle :global(.icon) {
    transform: rotate(90deg);
    color: var(--muted);
  }
  .toggle[aria-expanded='false'] :global(.icon) {
    transform: none;
  }
  .pair {
    display: flex;
    justify-content: center;
    padding: 6px 0 8px;
    background: var(--paper);
    border: 1px dashed var(--line);
    border-radius: var(--r-control);
  }
  p {
    margin: 0;
    font-size: 13px;
  }
  .compact {
    align-items: center;
    padding: 10px 12px;
    max-width: 180px;
    text-align: center;
  }
  .compact header {
    order: 2;
    flex-direction: column;
    gap: 0;
  }
  .compact header > :global(.icon) {
    display: none;
  }
  .compact h2 {
    font-size: 12px;
    font-weight: 450;
    color: var(--muted);
  }
  .compact .mm {
    color: var(--ink);
    font-weight: 650;
  }
  .compact .pair {
    padding: 0;
    border: 0;
    background: none;
  }
</style>
