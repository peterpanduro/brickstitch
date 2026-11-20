<script lang="ts">
  import type { BeadTypeId, PatternMode } from '../../../core';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import RadioCards from './RadioCards.svelte';
  import StepHead from './StepHead.svelte';

  /** Step 1 Beskär (SPEC R53): crop hint and reset (R38), mode and bead type. */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
</script>

<StepHead title={t('wizard.crop.title')} lead={t('wizard.crop.lead')} />
<div class="crop">
  <p class="muted sm">{t('import.cropHint')} {t('import.cropKeys')}</p>
  <div class="row">
    <button type="button" class="btn sm" onclick={() => (w.crop = null)} disabled={!w.crop}>
      {t('import.cropReset')}
    </button>
    {#if w.crop}
      <span class="muted sm num">
        {t('import.cropSize', { w: w.crop.width, h: w.crop.height })}
      </span>
    {/if}
  </div>
</div>
<section aria-labelledby="import-what">
  <h3 id="import-what">{t('wizard.crop.what')}</h3>
  <RadioCards
    label={t('wizard.crop.what')}
    options={[
      { value: 'panel', title: t('wizard.mode.panel'), hint: t('wizard.mode.panelHint') },
      { value: 'shaped', title: t('wizard.mode.shaped'), hint: t('wizard.mode.shapedHint') },
    ] satisfies { value: PatternMode; title: string; hint: string }[]}
    value={w.mode}
    onchange={(m) => w.setMode(m)}
    row
  />
</section>
<section aria-labelledby="import-beads">
  <h3 id="import-beads">{t('wizard.beads')}</h3>
  <RadioCards
    label={t('wizard.beads')}
    options={(['delica11', 'delica15'] as const).map((b) => ({
      value: b as BeadTypeId,
      title: t(`bead.${b}`),
      hint: t(`wizard.bead.${b}`),
    }))}
    value={w.beadType}
    onchange={(b) => (w.beadType = b)}
    row
  />
</section>

<style>
  .crop {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sm {
    margin: 0;
    font-size: 12px;
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
</style>
