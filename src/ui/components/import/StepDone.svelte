<script lang="ts">
  import { colourLabel, formatMm } from '../../../core';
  import { importStatsText } from '../../state/import-merge';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import Icon from '../Icon.svelte';
  import StepHead from './StepHead.svelte';

  /**
   * Step 5 Klart (SPEC R53): read-only summary (stats line, size, colours, checklist items of
   * the merged pattern, no fix buttons) and why "Använd mönstret" is disabled.
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const loc = $derived(w.editor.locale);
</script>

<StepHead title={t('wizard.done.title')} lead={t('wizard.done.lead')} />
{#if w.block}
  <p id="import-block" class="block" class:err={w.block !== 'import.working'} role="status">
    {t(w.block)}
  </p>
{:else if w.result}
  <dl>
    <dt>{t('wizard.size')}</dt>
    <dd class="num">
      {t('size.mm', { w: formatMm(loc, w.motifMm.width), h: formatMm(loc, w.motifMm.height) })} ·
      {w.lattice.width} × {w.lattice.height}
    </dd>
    <dt>{t('wizard.step.colours')}</dt>
    <dd>
      <ul class="chips">
        {#each w.result.a.usedPalette as e (e.id)}
          <li class="pill"><span class="sw s" style:--c={e.hex}></span>{colourLabel(e, loc)}</li>
        {/each}
      </ul>
    </dd>
  </dl>
  <p class="muted stats">{importStatsText(w.result.stats, t)}</p>
  <ul class="checks" aria-label={t('check.heading')}>
    {#each w.checklist as item (item.id)}
      <li class={item.kind}>
        <Icon name={item.kind === 'pass' ? 'check' : 'alert'} size={18} />
        <span>
          <span class="b">{t(item.title.key, item.title.params)}</span>
          {#if item.detail}
            <span class="muted sm">{t(item.detail.key, item.detail.params)}</span>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .block {
    margin: 0;
    color: var(--muted);
  }
  .block.err {
    color: var(--danger);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    margin: 0;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
  }
  .chips,
  .checks {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    gap: 6px;
  }
  .chips {
    flex-wrap: wrap;
  }
  .chips .pill {
    color: var(--ink);
  }
  .stats {
    margin: 0;
    font-size: 12px;
  }
  .checks {
    flex-direction: column;
    gap: 10px;
  }
  .checks li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .checks li > span {
    display: flex;
    flex-direction: column;
  }
  .pass :global(svg) {
    color: var(--ok);
  }
  .issue :global(svg) {
    color: var(--warn);
  }
  .b {
    font-weight: 600;
  }
  .sm {
    font-size: 12px;
  }
</style>
