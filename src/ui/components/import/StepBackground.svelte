<script lang="ts">
  import type { BackgroundMode } from '../../../core';
  import {
    backgroundChoice,
    backgroundPatch,
    removalAutoPatch,
    removalPatch,
    removalSlider,
    type BackgroundChoice,
  } from '../../state/import-settings';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import Icon from '../Icon.svelte';
  import MoreSettings from './MoreSettings.svelte';
  import RadioCards from './RadioCards.svelte';
  import StepHead from './StepHead.svelte';
  import WordSlider from './WordSlider.svelte';

  /**
   * Step 2 Bakgrund (SPEC R53): background cards, the worded removal slider with its status
   * line (highlight `edge`), hint, and the full mode select and invert under "Fler".
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const MODES: BackgroundMode[] = ['auto', 'alpha', 'borderKey', 'threshold', 'none'];
  const choice = $derived(backgroundChoice(w.form));
  const slider = $derived(removalSlider(w.form, w.result?.stats.background ?? null));
  const custom = $derived(
    w.form.background === 'threshold'
      ? `${t('import.bg.threshold')} · ${t('import.invert')}`
      : t(`import.bg.${w.form.background}`),
  );
  const options = $derived([
    {
      value: 'auto' as BackgroundChoice,
      title: t('wizard.bg.auto'),
      badge: t('wizard.bg.autoBadge'),
      hint: t('wizard.bg.autoHint'),
    },
    {
      value: 'light' as BackgroundChoice,
      title: t('wizard.bg.light'),
      hint: t('wizard.bg.lightHint'),
    },
    {
      value: 'whole' as BackgroundChoice,
      title: t('wizard.bg.whole'),
      hint: t('wizard.bg.wholeHint'),
    },
    ...(choice === 'custom'
      ? [
          {
            value: 'custom' as BackgroundChoice,
            title: t('wizard.bg.custom', { mode: custom }),
            hint: t('wizard.bg.customHint'),
            disabled: true,
          },
        ]
      : []),
  ]);
</script>

<StepHead title={t('wizard.bg.title')} lead={t('wizard.bg.lead')} />
<RadioCards
  label={t('wizard.bg.title')}
  {options}
  value={choice}
  onchange={(c) => c !== 'custom' && w.set(backgroundPatch(c))}
/>
{#if slider.visible}
  <WordSlider
    {w}
    title={t('wizard.bg.amount')}
    less={t('wizard.bg.less')}
    more={t('wizard.bg.more')}
    min={slider.min}
    max={slider.max}
    step={1}
    value={slider.value}
    highlight="edge"
    onchange={(v) => w.set(removalPatch(slider, v))}
  />
  {#if slider.field === 'borderKeyTolerance'}
    <label class="auto">
      <span>{t('wizard.bg.autoAmount')}</span>
      <input
        type="checkbox"
        class="switch"
        checked={slider.auto}
        onchange={(e) =>
          w.set(e.currentTarget.checked ? removalAutoPatch : removalPatch(slider, slider.value))}
      />
    </label>
  {/if}
{/if}
{#if slider.status}
  <p class="status" role="status">{t(slider.status)}</p>
{/if}
{#if slider.visible}
  <p class="note"><Icon name="info" size={18} />{t('wizard.bg.hint')}</p>
{/if}
<MoreSettings {t}>
  <label>
    {t('import.background')}
    <select
      value={w.form.background}
      onchange={(e) => w.set({ background: e.currentTarget.value as BackgroundMode })}
    >
      {#each MODES as m (m)}
        <option value={m}>{t(`import.bg.${m}`)}</option>
      {/each}
    </select>
  </label>
  {#if w.form.background === 'threshold'}
    <label>
      {t('import.invert')}
      <input
        type="checkbox"
        class="switch"
        checked={w.form.thresholdInvert}
        onchange={(e) => w.set({ thresholdInvert: e.currentTarget.checked })}
      />
    </label>
  {/if}
</MoreSettings>

<style>
  .status {
    margin: -8px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .auto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: -4px 0 0;
    font-size: 13px;
  }
  .note {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 12px;
  }
  .note :global(svg) {
    color: var(--accent);
    flex: none;
  }
</style>
