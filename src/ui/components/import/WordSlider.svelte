<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ActiveSlider } from '../../state/highlight';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { sliderFill } from '../../state/slider';

  /**
   * Slider with worded ends (SPEC R53): title, optional hint and action, the range input with
   * the live highlight `highlight` (R39), and the end labels.
   */
  let {
    w,
    title,
    hint,
    less,
    more,
    min,
    max,
    step,
    value,
    highlight,
    onchange,
    action,
  }: {
    w: ImportWizard;
    title: string;
    hint?: string;
    less: string;
    more: string;
    min: number;
    max: number;
    step: number;
    value: number;
    highlight: ActiveSlider;
    onchange: (v: number) => void;
    action?: Snippet;
  } = $props();
  const id = $props.id();
  const track = $derived(w.track(highlight));
</script>

<div class="sl">
  <div class="row">
    <label class="b" for={id}>{title}</label>
    {#if hint}<span class="muted sm">{hint}</span>{/if}
    <span class="sp"></span>
    {@render action?.()}
  </div>
  <input
    {id}
    type="range"
    class="slider"
    {min}
    {max}
    {step}
    {value}
    style:--fill={sliderFill(value, min, max)}
    aria-describedby="{id}-ends"
    oninput={(e) => {
      onchange(e.currentTarget.valueAsNumber);
      track.oninput();
    }}
    onpointerdown={track.onpointerdown}
    onlostpointercapture={track.onlostpointercapture}
  />
  <div class="ends" id="{id}-ends">
    <span>{less}</span>
    <span>{more}</span>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
  .b {
    font-weight: 600;
  }
  .sm {
    font-size: 12px;
  }
  input {
    width: 100%;
    margin-top: 6px;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }
</style>
