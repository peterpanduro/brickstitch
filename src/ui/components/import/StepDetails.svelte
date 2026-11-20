<script lang="ts">
  import type { FitMode } from '../../../core';
  import type { Text } from '../../state/checklist';
  import type { ImportForm } from '../../state/import-settings';
  import { linesResetValue } from '../../state/import-wizard';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { sliderFill } from '../../state/slider';
  import Icon from '../Icon.svelte';
  import MoreSettings from './MoreSettings.svelte';
  import PresetThumbs from './PresetThumbs.svelte';
  import StepHead from './StepHead.svelte';
  import WordSlider from './WordSlider.svelte';

  /**
   * Step 4 Detaljer (SPEC R53): presets, Linjer (R52.6) and Små detaljer sliders with
   * highlights, "Laga automatiskt" with live counts, and coverage/margin/fit under "Fler".
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const FITS: FitMode[] = ['auto', 'contain', 'width', 'height', 'stretch'];
  const reset = $derived(linesResetValue(w.lastPreset));
  const fixes = $derived<
    { field: 'fixRings' | 'despeckle' | 'autoPrune'; label: string; report: Text | null }[]
  >([
    { field: 'fixRings', label: t('wizard.fix.rings'), report: w.report?.rings ?? null },
    { field: 'despeckle', label: t('wizard.fix.despeckle'), report: w.report?.despeckle ?? null },
    ...(w.mode === 'shaped'
      ? [
          {
            field: 'autoPrune' as const,
            label: t('wizard.fix.prune'),
            report: w.report?.prune ?? null,
          },
        ]
      : []),
  ]);
  const set = (patch: Partial<ImportForm>): void => w.set(patch);
</script>

<StepHead title={t('wizard.det.title')} lead={t('wizard.det.lead')} />
<PresetThumbs {w} />
<WordSlider
  {w}
  title={t('wizard.det.lines')}
  less={t('wizard.det.linesLess')}
  more={t('wizard.det.linesMore')}
  min={0}
  max={1}
  step={0.05}
  value={w.form.lineSensitivity}
  highlight="lines"
  onchange={(v) => set({ lineSensitivity: v })}
>
  {#snippet action()}
    {#if Math.abs(w.form.lineSensitivity - reset) > 1e-9}
      <button type="button" class="link" onclick={() => set({ lineSensitivity: reset })}>
        {t('wizard.det.reset')}
      </button>
    {/if}
  {/snippet}
</WordSlider>
<WordSlider
  {w}
  title={t('wizard.det.details')}
  hint={t('wizard.det.detailsHint')}
  less={t('wizard.det.fewer')}
  more={t('wizard.det.more')}
  min={0}
  max={1}
  step={0.05}
  value={w.form.details}
  highlight="details"
  onchange={(v) => set({ details: v })}
/>
<section class="card fix" aria-labelledby="import-fix">
  <h3 id="import-fix"><Icon name="wand" />{t('wizard.fix.title')}</h3>
  {#each fixes as f (f.field)}
    <label class="row">
      <input
        type="checkbox"
        class="check"
        checked={w.form[f.field]}
        onchange={(e) => set({ [f.field]: e.currentTarget.checked })}
      />
      <span>
        {f.label}
        {#if f.report}
          <span class="report" class:none={f.report.key === 'wizard.fix.none'} aria-live="polite">
            {t(f.report.key, f.report.params)}
          </span>
        {/if}
      </span>
    </label>
  {/each}
</section>
<MoreSettings {t}>
  <label>
    {t('import.coverage')}
    <span class="ctl">
      <input
        type="range"
        class="slider"
        min="0.3"
        max="0.7"
        step="0.05"
        value={w.form.coverage}
        style:--fill={sliderFill(w.form.coverage, 0.3, 0.7)}
        oninput={(e) => set({ coverage: e.currentTarget.valueAsNumber })}
      />
      <output class="num">{w.form.coverage.toFixed(2)}</output>
    </span>
  </label>
  <label>
    {t('import.margin')}
    <select value={w.form.margin} onchange={(e) => set({ margin: e.currentTarget.value })}>
      <option value="auto">{t('import.marginAuto')}</option>
      {#each [0, 1, 2, 3, 4, 5] as m (m)}
        <option value={String(m)}>{m}</option>
      {/each}
    </select>
  </label>
  <label>
    {t('import.fit')}
    <select value={w.form.fit} onchange={(e) => set({ fit: e.currentTarget.value as FitMode })}>
      {#each FITS as f (f)}
        <option value={f}>{t(`import.fit.${f}`)}</option>
      {/each}
    </select>
  </label>
</MoreSettings>

<style>
  .link {
    border: 0;
    background: none;
    padding: 0;
    min-height: 24px;
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
  }
  .fix {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0;
  }
  h3 :global(svg) {
    color: var(--accent);
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .report {
    display: block;
    font-size: 12px;
    color: var(--ok);
  }
  .report.none {
    color: var(--muted);
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  output {
    min-width: 2.5rem;
    text-align: right;
    color: var(--muted);
  }
</style>
