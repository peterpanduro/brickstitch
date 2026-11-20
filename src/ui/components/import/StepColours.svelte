<script lang="ts">
  import { colourCount } from '../../state/import-wizard';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { paletteRowLabels } from '../../state/palette';
  import Icon from '../Icon.svelte';
  import RadioCards from './RadioCards.svelte';
  import StepHead from './StepHead.svelte';

  /**
   * Step 3 Färger (SPEC R53): the catalogue choice (`includeExtra`), number of colours
   * (`maxColors`, shown clamped to the candidates), the base palette with detail switches, and
   * the colours the preview uses.
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const loc = $derived(w.editor.locale);
  const count = $derived(colourCount(w.form.maxColors, w.palette.length));
  const uid = $props.id();
</script>

<StepHead
  title={t('wizard.col.title')}
  lead={t(w.includeExtra ? 'wizard.col.leadCatalogue' : 'wizard.col.leadPattern')}
/>
<RadioCards
  label={t('wizard.col.source')}
  options={[
    { value: 'pattern', title: t('wizard.col.onlyPattern') },
    { value: 'catalogue', title: t('wizard.col.catalogue') },
  ]}
  value={w.includeExtra ? 'catalogue' : 'pattern'}
  onchange={(v) => (w.includeExtra = v === 'catalogue')}
/>
<div class="count">
  <div>
    <span class="b" id="import-count">{t('wizard.col.count')}</span>
    {#if w.mode === 'panel'}<span class="muted sm">{t('wizard.col.countNote')}</span>{/if}
    {#if count.limited}
      <span class="muted sm note">{t('wizard.col.limited', { n: w.palette.length })}</span>
    {/if}
  </div>
  <div class="stepper" role="group" aria-labelledby="import-count">
    <button
      type="button"
      class="btn icon"
      aria-label={t('wizard.col.fewer')}
      disabled={count.shown <= 2}
      onclick={() => w.set({ maxColors: count.shown - 1 })}
    >
      <Icon name="minus" />
    </button>
    <output class="num" aria-live="polite">{count.shown}</output>
    <button
      type="button"
      class="btn icon"
      aria-label={t('wizard.col.moreColours')}
      disabled={count.shown >= count.max}
      onclick={() => w.set({ maxColors: count.shown + 1 })}
    >
      <Icon name="plus" />
    </button>
  </div>
</div>
<ul class="list" aria-label={t('wizard.col.list')}>
  {#each w.base.palette as e (e.id)}
    {@const r = paletteRowLabels(e, loc)}
    <li>
      <span class="sw" style:--c={e.hex}></span>
      <span class="grow">
        <span class="b" id="{uid}-{e.id}">{r.name}</span>
        {#if r.db}<span class="muted sm">{r.db}</span>{/if}
      </span>
      <label class="sm">
        <span id="{uid}-{e.id}-d">{t('wizard.col.detail')}</span>
        <input
          type="checkbox"
          class="switch"
          aria-labelledby="{uid}-{e.id}-d {uid}-{e.id}"
          checked={w.detail[e.id] ?? e.detail ?? false}
          onchange={(ev) => (w.detail = { ...w.detail, [e.id]: ev.currentTarget.checked })}
        />
      </label>
    </li>
  {/each}
</ul>
{#if w.result}
  <section aria-labelledby="import-used">
    <h3 id="import-used">{t('wizard.col.used')}</h3>
    <ul class="chips">
      {#each w.result.a.usedPalette as e (e.id)}
        <li class="pill">
          <span class="sw s" style:--c={e.hex}></span>{paletteRowLabels(e, loc).name}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .count {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  output {
    min-width: 2ch;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
  }
  .b {
    font-weight: 600;
  }
  .sm {
    font-size: 12px;
  }
  .list,
  .chips {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .list label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    max-width: 9rem;
    text-align: right;
  }
  .note {
    display: block;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0;
  }
  .chips {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .chips .pill {
    color: var(--ink);
  }
</style>
