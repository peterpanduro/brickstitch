<script lang="ts">
  import { untrack } from 'svelte';
  import { thumbMisses } from '../../state/import-wizard';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { DETAIL_PRESETS } from '../../state/presets';
  import SceneShapes from '../SceneShapes.svelte';

  /**
   * Detail presets Enkel / Lagom / Detaljerad (SPEC R52.7) as radio cards with real preview
   * thumbnails: computed one at a time when idle, cached by settings key; a change of the
   * settings cancels the pending one and queues only the missing thumbnails.
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const name = $props.id();

  const idle = (fn: () => void): (() => void) => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(fn, { timeout: 1000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(fn, 50);
    return () => clearTimeout(id);
  };

  $effect(() => {
    const keys = w.thumbKeys;
    let cancel = (): void => {};
    untrack(() => {
      w.pruneThumbs();
      const queue = thumbMisses(keys, w.thumbs);
      const run = (): void => {
        const k = queue.shift();
        if (k === undefined) return;
        w.computeThumb(k);
        cancel = idle(run);
      };
      cancel = idle(run);
    });
    return () => cancel();
  });
</script>

<div class="presets" role="radiogroup" aria-label={t('wizard.det.presets')}>
  {#each DETAIL_PRESETS as p, i (p.id)}
    {@const s = w.thumbs[w.thumbKeys[i] ?? '']}
    <label class="preset" class:on={w.detailPreset === p.id}>
      <input
        type="radio"
        class="sr-only"
        {name}
        checked={w.detailPreset === p.id}
        onchange={() => w.applyPreset(p)}
      />
      <span class="pv" aria-hidden="true">
        {#if s === 'failed'}
          <span class="muted">–</span>
        {:else if s}
          <svg viewBox="0 0 {s.widthMm} {s.heightMm}">
            <SceneShapes scene={s} hatchId="{name}-{p.id}" bare />
          </svg>
        {:else}
          <span class="spinner" role="img" aria-label={t('wizard.preset.loading')}></span>
        {/if}
      </span>
      {t(`wizard.preset.${p.id}`)}
    </label>
  {/each}
</div>

<style>
  .presets {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .preset {
    flex: 1;
    border: 1.5px solid var(--line);
    border-radius: 12px;
    padding: 8px 6px;
    text-align: center;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .preset.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .preset:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pv {
    height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border-radius: 8px;
    margin-bottom: 6px;
    overflow: hidden;
    padding: 6px;
  }
  svg {
    width: 100%;
    height: 100%;
  }
  .spinner {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--line-strong);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
