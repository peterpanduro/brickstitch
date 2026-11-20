<script lang="ts" generics="T extends string">
  import { cycleIndex } from '../../state/roving';

  /** Segmented radio group (roving tabindex, arrows wrap, Home/End; SPEC R56). */
  let {
    label,
    options,
    value,
    onchange,
    accent = false,
  }: {
    label: string;
    options: readonly { readonly value: T; readonly label: string }[];
    value: T;
    onchange: (v: T) => void;
    /** Selected segment in accent colours (size bar) instead of raised. */
    accent?: boolean;
  } = $props();

  let group = $state<HTMLElement>();
  const selected = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );

  function key(e: KeyboardEvent): void {
    const i = cycleIndex(options.length, selected, e.key);
    const o = i === null ? undefined : options[i];
    if (!o) return;
    e.preventDefault();
    onchange(o.value);
    group?.querySelectorAll<HTMLElement>('[role="radio"]')[i!]?.focus();
  }
</script>

<div
  class="seg"
  class:accent
  role="radiogroup"
  aria-label={label}
  bind:this={group}
  tabindex="-1"
  onkeydown={key}
>
  {#each options as o, i (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={i === selected ? 0 : -1}
      onclick={() => onchange(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg > button {
    font: inherit;
    font-weight: 550;
    font-size: 13px;
    cursor: pointer;
  }
  .accent {
    background: var(--surface);
  }
  .accent > [aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent);
    box-shadow: none;
  }
</style>
