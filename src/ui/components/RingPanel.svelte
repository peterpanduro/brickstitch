<script lang="ts">
  import { untrack } from 'svelte';
  import { formatMm } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import {
    RING_WIDTH,
    ringPreview,
    ringRadioTarget,
    selectRingCandidate,
    setRingCentred,
    setRingThickness,
    setRingWidth,
  } from '../state/ring';
  import { paletteOptionLabel } from '../state/palette';
  import ShapeList from './ShapeList.svelte';

  /** Ring tool options and candidate previews (SPEC R36), hosted by the tool card. */
  let { editor }: { editor: EditorStore } = $props();

  const PX_PER_MM = 4;
  const t0 = untrack(() => editor.ring.thicknessMm);
  let custom = $state(t0 !== null);
  let tMin = $state(t0?.min ?? 0.55);
  let tMax = $state(t0?.max ?? 0.9);

  const ring = $derived(editor.ring);
  const cands = $derived(editor.ringCandidates);
  const chosen = $derived(editor.ringSelected);
  const entry = $derived(editor.pattern.palette.find((e) => e.id === editor.color));
  const hex = $derived(entry?.hex ?? '#888888');

  function applyThickness(): void {
    editor.setRing((s) => setRingThickness(s, custom ? { min: tMin, max: tMax } : null));
  }

  function onKey(e: KeyboardEvent): void {
    const next = ringRadioTarget(e.key, chosen, cands.length);
    if (next === null) return;
    e.preventDefault();
    editor.setRing((s) => selectRingCandidate(s, next));
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }
</script>

<div class="ring">
  <label>
    {editor.t('ui.ringWidth')}
    <input
      type="number"
      min={RING_WIDTH.min}
      max={RING_WIDTH.max}
      value={ring.widthBeads}
      onchange={(e) => editor.setRing((s) => setRingWidth(s, e.currentTarget.valueAsNumber))}
    />
  </label>
  <label>
    {editor.t('ui.ringColor')}
    <span class="color">
      <span class="sw s" style:--c={hex}></span>
      <select value={editor.color} onchange={(e) => editor.setColor(e.currentTarget.value)}>
        {#each editor.pattern.palette as e (e.id)}
          <option value={e.id}>{paletteOptionLabel(e, editor.locale)}</option>
        {/each}
      </select>
    </span>
  </label>
  {#if editor.pattern.mode === 'panel'}
    <label class="check">
      <input
        type="checkbox"
        checked={ring.centreH}
        onchange={(e) => editor.setRing((s) => setRingCentred(s, e.currentTarget.checked))}
      />
      {editor.t('ui.ringCentre')}
    </label>
  {/if}
  <details open={custom}>
    <summary>{editor.t('ui.ringThickness')}</summary>
    <label class="check">
      <input type="checkbox" bind:checked={custom} onchange={applyThickness} />
      {editor.t('ui.ringThicknessCustom')}
    </label>
    <div class="range">
      <label>
        {editor.t('ui.ringThicknessMin')}
        <input
          type="number"
          step="0.05"
          min="0.05"
          disabled={!custom}
          bind:value={tMin}
          onchange={applyThickness}
        />
      </label>
      <label>
        {editor.t('ui.ringThicknessMax')}
        <input
          type="number"
          step="0.05"
          min="0.05"
          disabled={!custom}
          bind:value={tMax}
          onchange={applyThickness}
        />
      </label>
    </div>
  </details>
  <h3 id="ring-cands">{editor.t('ui.ringCandidates')}</h3>
  {#if cands.length === 0}
    <p>{editor.t('ui.ringNone')}</p>
  {:else}
    <div
      class="cands"
      role="radiogroup"
      aria-labelledby="ring-cands"
      tabindex="-1"
      onkeydown={onKey}
    >
      {#each cands as c, i (i)}
        {@const v = ringPreview(c, editor.pattern.beadType, hex)}
        {@const beads = editor.t('ui.ringBeads', { n: c.score.beadCount })}
        {@const size = editor.t('ui.ringSize', {
          w: formatMm(editor.locale, c.score.widthMm),
          h: formatMm(editor.locale, c.score.heightMm),
        })}
        {@const runs = editor.t('ui.ringRuns', { top: c.score.topRun, bottom: c.score.bottomRun })}
        <button
          type="button"
          class="cand"
          role="radio"
          aria-checked={i === chosen}
          aria-label="{beads}, {size}, {runs}"
          tabindex={i === chosen ? 0 : -1}
          onclick={() => editor.setRing((s) => selectRingCandidate(s, i))}
        >
          <svg
            viewBox="{v.x} {v.y} {v.widthMm} {v.heightMm}"
            width={v.widthMm * PX_PER_MM}
            height={v.heightMm * PX_PER_MM}
            aria-hidden="true"
          >
            <ShapeList shapes={v.shapes} hatchId="bs-hatch" />
          </svg>
          <span>{beads}</span>
          <span>{size}</span>
          <span>{runs}</span>
        </button>
      {/each}
    </div>
  {/if}
  <p class="sr-only" aria-live="polite">{editor.ringStatus}</p>
  <p id="ring-hint" class="hint">
    {editor.t(editor.color === null ? 'ui.ringNoColor' : 'ui.ringHint')}
  </p>
</div>

<style>
  .ring {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  h3 {
    font-size: 13px;
    font-weight: 650;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
  }
  .color {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }
  .range {
    display: flex;
    gap: 0.4rem;
  }
  .range input {
    width: 5rem;
  }
  .cands {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .cand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.3rem;
    font-size: 0.75rem;
    width: 6.6rem;
  }
  .cand[aria-checked='true'] {
    outline: 2px solid var(--accent);
    background: var(--accent-soft);
  }
  .hint {
    color: var(--muted);
    margin: 0;
  }
</style>
