<script lang="ts">
  import { COLOUR_FAMILIES, type ColourFamily } from '../state/colour-family';
  import type { EditorStore } from '../state/editor.svelte';
  import { colorChoices, gridIndex, type ColorChoice, type ColorSpec } from '../state/palette';
  import Icon from './Icon.svelte';

  /**
   * Add-colour picker (SPEC R47): search, family chips, a swatch listbox (arrows move, Enter adds)
   * and a detail row with the add button.
   */
  let {
    editor,
    onPick,
    onClose,
  }: { editor: EditorStore; onPick: (spec: ColorSpec) => void; onClose: () => void } = $props();

  const COLS = 8;
  let query = $state('');
  let family = $state<ColourFamily | 'all'>('all');
  let activeKey = $state<string | null>(null);

  const choices = $derived(colorChoices(query, editor.locale, editor.library, family));
  const index = $derived(
    Math.max(
      0,
      choices.findIndex((c) => c.key === activeKey),
    ),
  );
  const active = $derived(choices[index]);
  const optionText = (c: ColorChoice) =>
    [c.label, c.db, c.source === 'library' ? editor.t('ui.myColors') : undefined]
      .filter(Boolean)
      .join(' · ');
  const optionId = (key: string) => `pick-${key.replace(/[^a-z0-9]/gi, '-')}`;

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && active) {
      e.preventDefault();
      onPick(active.spec);
      return;
    }
    const next = gridIndex(choices.length, index, COLS, e.key);
    if (next === null) return;
    e.preventDefault();
    const c = choices[next];
    if (!c) return;
    activeKey = c.key;
    document.getElementById(optionId(c.key))?.scrollIntoView({ block: 'nearest' });
  }
</script>

<div class="picker">
  <div class="head">
    <h3 class="serif">{editor.t('palette.add')}</h3>
    <button
      type="button"
      class="btn ghost sm icon"
      aria-label={editor.t('palette.close')}
      onclick={onClose}
    >
      <Icon name="close" size={18} />
    </button>
  </div>
  <label class="search">
    <Icon name="search" size={18} />
    <input
      type="search"
      bind:value={query}
      placeholder={editor.t('palette.search')}
      aria-label={editor.t('palette.search')}
    />
  </label>
  <div class="chips" role="group" aria-label={editor.t('palette.families')}>
    {#each ['all', ...COLOUR_FAMILIES] as const as f (f)}
      <button
        type="button"
        class="pill chip"
        class:acc={family === f}
        aria-pressed={family === f}
        onclick={() => (family = f)}
      >
        {editor.t(`palette.family.${f}`)}
      </button>
    {/each}
  </div>
  {#if choices.length === 0}
    <p class="muted empty">{editor.t('palette.noMatches')}</p>
  {:else}
    <div
      class="grid"
      role="listbox"
      tabindex="0"
      aria-label={editor.t('palette.add')}
      style:--cols={COLS}
      aria-activedescendant={active ? optionId(active.key) : undefined}
      onkeydown={onKey}
    >
      {#each choices as c (c.key)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          id={optionId(c.key)}
          class="sw opt"
          class:on={c.key === active?.key}
          class:lib={c.source === 'library'}
          role="option"
          tabindex="-1"
          aria-selected={c.key === active?.key}
          aria-label={optionText(c)}
          title={optionText(c)}
          style:--c={c.hex}
          onclick={() => (activeKey = c.key)}
          ondblclick={() => onPick(c.spec)}
        ></div>
      {/each}
    </div>
  {/if}
  {#if active}
    <div class="card detail">
      <span class="sw l" style:--c={active.hex}></span>
      <div class="grow">
        <div class="b">{active.label}</div>
        <div class="sm muted">
          {active.source === 'library'
            ? [editor.t('ui.myColors'), active.db].filter(Boolean).join(' · ')
            : editor.t('palette.detail', { db: active.db ?? '' })}
        </div>
      </div>
      <button type="button" class="btn primary sm" onclick={() => onPick(active.spec)}>
        {editor.t('palette.addButton')}
      </button>
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h3 {
    margin: 0;
    font-size: 17px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--muted);
    background: var(--surface);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--ink);
    outline: none;
  }
  .search:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    border: 0;
    cursor: pointer;
    min-height: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 8px 6px;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
  }
  .opt {
    width: 100%;
    height: 30px;
    cursor: pointer;
  }
  .opt {
    position: relative;
  }
  .opt.lib::after {
    content: '';
    position: absolute;
    right: 3px;
    top: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--surface);
    border: 1.5px solid var(--accent);
  }
  .opt.on {
    outline: 2.5px solid var(--accent);
    outline-offset: 2px;
  }
  .detail {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .b {
    font-weight: 650;
  }
  .sm {
    font-size: 13px;
  }
  .empty {
    margin: 0;
  }
</style>
