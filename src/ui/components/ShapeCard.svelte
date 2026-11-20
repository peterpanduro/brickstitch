<script lang="ts">
  import type { PatternMode } from '../../core';

  /**
   * Radio card of the "Form" section (SPEC R55): a lattice illustration of the shape, its
   * name and a hint. The native radio keeps arrow-key roving and `aria-checked`.
   */
  let {
    kind,
    title,
    hint,
    checked,
    onselect,
  }: {
    kind: PatternMode;
    title: string;
    hint: string;
    checked: boolean;
    onselect: () => void;
  } = $props();

  const ROWS = 9;
  const COLS = 9;
  const beads = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: r % 2 === 0 ? COLS : COLS - 1 }, (_, i) => ({
      x: i * 10 + (r % 2 === 0 ? 0 : 5),
      y: r * 8,
    })),
  ).flat();
</script>

<label class="shape" class:on={checked}>
  <input type="radio" name="start-shape" class="sr-only" {checked} onchange={onselect} />
  <span class="pv" aria-hidden="true">
    {#if kind === 'panel'}
      <svg viewBox="0 0 90 72" width="90" height="72">
        {#each beads as b (`${b.x},${b.y}`)}
          <rect x={b.x + 0.5} y={b.y + 0.5} width="9" height="7" rx="2" class="bead" />
        {/each}
      </svg>
    {:else}
      <span class="free"></span>
    {/if}
  </span>
  <span class="b">{title}</span>
  <span class="hint">{hint}</span>
</label>

<style>
  .shape {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px;
    text-align: center;
    border: 1.5px solid var(--line);
    border-radius: var(--r-float);
    background: var(--surface);
    cursor: pointer;
  }
  .shape.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .shape:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pv {
    height: 124px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }
  .bead {
    fill: var(--paper);
    stroke: var(--muted);
    stroke-width: 0.6;
  }
  .free {
    width: 80px;
    height: 104px;
    border: 2px dashed var(--muted);
    border-radius: 40% 40% 50% 50%;
    opacity: 0.6;
  }
  .b {
    font-weight: 600;
  }
  .hint {
    font-size: 11px;
    color: var(--muted);
  }
</style>
