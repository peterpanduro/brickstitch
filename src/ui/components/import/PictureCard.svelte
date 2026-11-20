<script lang="ts">
  import { formatMm } from '../../../core';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { pictureLegend } from '../../state/overlay';
  import CropView from '../CropView.svelte';
  import Icon from '../Icon.svelte';
  import Segmented from './Segmented.svelte';

  /**
   * "Din bild" (SPEC R53): processed/original toggle (R52.5), crop view with live highlights
   * and legend chip, file name and orientation buttons (R31).
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const legend = $derived(
    w.processed &&
      pictureLegend(
        w.processed.highlight,
        t,
        formatMm(w.editor.locale, w.result?.a.stats.minLineWidthBeads ?? w.line.minLineWidthBeads),
      ),
  );
</script>

<section class="card pane" aria-labelledby="import-picture">
  <div class="row">
    <h2 id="import-picture">{t('wizard.picture')}</h2>
    <span class="sp"></span>
    <Segmented
      label={t('wizard.view.label')}
      options={[
        { value: 'processed', label: t('wizard.view.processed') },
        { value: 'original', label: t('wizard.view.original') },
      ]}
      value={w.showOriginal ? 'original' : 'processed'}
      onchange={(v) => (w.showOriginal = v === 'original')}
    />
  </div>
  <CropView
    img={w.img}
    rotation={w.form.rotation}
    flipH={w.form.flipH}
    bind:crop={w.crop}
    processed={w.processed}
    {legend}
    {t}
  />
  <div class="row foot">
    <Icon name="crop" size={16} />
    <span class="name">{w.crop ? t('wizard.cropped', { name: w.fileName }) : w.fileName}</span>
    <span class="sp"></span>
    <div class="row" role="group" aria-label={t('import.orientation')}>
      <button
        type="button"
        class="btn ghost sm icon"
        onclick={() => w.rotate(-90)}
        aria-label={t('import.rotateLeft')}
        title={t('import.rotateLeft')}
      >
        <Icon name="rotate-left" />
      </button>
      <button
        type="button"
        class="btn ghost sm icon"
        onclick={() => w.rotate(90)}
        aria-label={t('import.rotateRight')}
        title={t('import.rotateRight')}
      >
        <Icon name="rotate-right" />
      </button>
      <button
        type="button"
        class="btn ghost sm icon"
        onclick={() => w.set({ flipH: !w.form.flipH })}
        aria-pressed={w.form.flipH}
        aria-label={t('import.mirror')}
        title={t('import.mirror')}
      >
        <Icon name="mirror" />
      </button>
    </div>
  </div>
</section>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    min-height: 0;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
  .foot {
    font-size: 12px;
    color: var(--muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  [aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
