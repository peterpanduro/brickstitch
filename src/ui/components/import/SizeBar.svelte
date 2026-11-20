<script lang="ts">
  import { formatMm } from '../../../core';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { sizePresets } from '../../state/presets';
  import Icon from '../Icon.svelte';
  import Segmented from './Segmented.svelte';

  /**
   * Size bar (SPEC R53, R52.8): Liten / Mellan / Stor set the width with an automatic height;
   * Egen shows the width/height fields with "Auto (från bilden)" (R34). Motif size in mm.
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const presets = $derived(sizePresets(w.mode));
  const options = $derived([
    ...presets.map((p) => ({ value: p.id as string, label: t(p.labelKey) })),
    { value: 'custom', label: t('size.preset.custom') },
  ]);
  const mm = $derived(
    t('size.mm', {
      w: formatMm(w.editor.locale, w.motifMm.width),
      h: formatMm(w.editor.locale, w.motifMm.height),
    }),
  );

  function choose(v: string): void {
    const p = presets.find((x) => x.id === v);
    if (p) w.setSizePreset(p);
    else w.customSize = true;
  }
</script>

<div class="sizebar">
  <div class="row">
    <Icon name="ruler" size={18} />
    <span class="b" id="import-size">{t('wizard.size')}</span>
    <Segmented label={t('wizard.size')} {options} value={w.sizePreset} onchange={choose} accent />
    <span class="sp"></span>
    <span class="b num">{mm}</span>
  </div>
  {#if w.sizePreset === 'custom'}
    <div class="row fields">
      {#each ['width', 'height'] as const as side (side)}
        <div class="field">
          <label>
            {t(side === 'width' ? 'ui.width' : 'ui.height')}
            <input
              type="number"
              min={side === 'width' ? 2 : 1}
              max={side === 'width' ? 80 : 120}
              value={w.size[side]}
              oninput={(e) => w.setSide(side, e.currentTarget.valueAsNumber)}
              disabled={w.form.autoSize === side}
              required
            />
          </label>
          <label class="auto">
            <input
              type="checkbox"
              class="check"
              checked={w.form.autoSize === side}
              onchange={(e) => w.setAuto(side, e.currentTarget.checked)}
            />
            {t('import.autoSize')}
          </label>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sizebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .sp {
    flex: 1;
  }
  .b {
    font-weight: 600;
    white-space: nowrap;
  }
  .fields {
    align-items: flex-start;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  input[type='number'] {
    width: 5rem;
  }
  .auto {
    color: var(--muted);
  }
</style>
