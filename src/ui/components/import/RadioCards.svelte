<script lang="ts" generics="T extends string">
  /**
   * Radio cards of a wizard step (native radios: arrows move the choice): title, optional
   * badge and hint. `value` not among the options selects none.
   */
  let {
    label,
    options,
    value,
    onchange,
    row = false,
  }: {
    label: string;
    options: readonly {
      readonly value: T;
      readonly title: string;
      readonly hint?: string;
      readonly badge?: string;
      readonly disabled?: boolean;
    }[];
    value: T;
    onchange: (v: T) => void;
    /** Cards side by side instead of stacked. */
    row?: boolean;
  } = $props();
  const name = $props.id();
</script>

<div class="cards" class:row role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <label class="opt" class:on={o.value === value} class:disabled={o.disabled}>
      <input
        type="radio"
        class="radio"
        {name}
        value={o.value}
        checked={o.value === value}
        disabled={o.disabled}
        onchange={() => onchange(o.value)}
      />
      <span class="grow">
        <span class="b">{o.title}</span>
        {#if o.badge}<span class="pill acc">{o.badge}</span>{/if}
        {#if o.hint}<span class="hint">{o.hint}</span>{/if}
      </span>
    </label>
  {/each}
</div>

<style>
  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    flex-direction: row;
  }
  .row .opt {
    flex: 1;
  }
  .opt {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 11px 12px;
    border: 1.5px solid var(--line);
    border-radius: 12px;
    cursor: pointer;
  }
  .opt.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .opt.disabled {
    cursor: default;
    border-style: dashed;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .b {
    font-weight: 600;
  }
  .pill {
    height: 20px;
    margin-left: 4px;
  }
  .hint {
    display: block;
    font-size: 12px;
    color: var(--muted);
  }
</style>
