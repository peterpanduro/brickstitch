<script lang="ts">
  import { colourCounts } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { paletteRowLabels, popoverTop } from '../state/palette';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from './Icon.svelte';
  import PaletteEntryEditor from './PaletteEntryEditor.svelte';
  import Popover from './Popover.svelte';

  /**
   * Pattern palette (SPEC R47): radiogroup rows (keys 1–9, arrows), per-row entry editor popover
   * and the add-colour picker popover.
   */
  let { editor }: { editor: EditorStore } = $props();

  let editingId = $state<string | null>(null);
  let editTop = $state(0);
  let adding = $state(false);
  let addButton = $state<HTMLButtonElement>();
  let pencils = $state<Record<string, HTMLButtonElement | undefined>>({});

  const counts = $derived(colourCounts(editor.pattern));
  const selected = $derived(editor.pattern.palette.find((e) => e.id === editor.color));
  const editing = $derived(editor.pattern.palette.find((e) => e.id === editingId));

  function onKey(e: KeyboardEvent): void {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    const pal = editor.pattern.palette;
    if (!step || pal.length === 0 || !(e.target as HTMLElement).matches('[role="radio"]')) return;
    e.preventDefault();
    const i = pal.findIndex((x) => x.id === editor.color);
    const next = pal[(i + step + pal.length) % pal.length];
    if (!next) return;
    editor.setColor(next.id);
    const radios = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]');
    radios[pal.indexOf(next)]?.focus();
  }

  function openEditor(id: string, row: HTMLElement): void {
    adding = false;
    editTop = popoverTop(row.getBoundingClientRect().top, 340, window.innerHeight);
    editingId = id;
  }

  function closeEditor(refocus: boolean): void {
    const id = editingId;
    editingId = null;
    if (id && refocus) queueMicrotask(() => pencils[id]?.focus());
  }

  function closePicker(refocus: boolean): void {
    adding = false;
    if (refocus) queueMicrotask(() => addButton?.focus());
  }
</script>

<section class="palette" aria-labelledby="palette-title">
  <div class="head">
    <h2 id="palette-title">{editor.t('palette.heading')}</h2>
    <span class="sm muted">{editor.t('palette.perPair')}</span>
  </div>
  <div
    class="list"
    role="radiogroup"
    aria-labelledby="palette-title"
    tabindex="-1"
    onkeydown={onKey}
  >
    {#each editor.pattern.palette as e, i (e.id)}
      {@const l = paletteRowLabels(e, editor.locale)}
      <div class="colr" class:on={editor.color === e.id}>
        <button
          type="button"
          class="entry"
          role="radio"
          aria-checked={editor.color === e.id}
          tabindex={editor.color === e.id || (selected === undefined && i === 0) ? 0 : -1}
          onclick={() => editor.setColor(e.id)}
        >
          <span class="sw l" style:--c={e.hex}></span>
          <span class="text">
            <span class="name">{l.name}</span>
            {#if l.db}
              <span class="db muted">
                {l.db}{#if l.approximate}<span title={editor.t('ui.approximate')}> ≈</span>{/if}
              </span>
            {:else if l.approximate}
              <span class="db muted" title={editor.t('ui.approximate')}>≈</span>
            {/if}
          </span>
          <span class="n">{(counts.get(e.id) ?? 0) * 2}</span>
          {#if i < 9}<span class="kbd" title={editor.t('ui.colorKey', { n: i + 1 })}>
              {i + 1}
            </span>{/if}
        </button>
        <button
          type="button"
          class="btn ghost sm icon pencil"
          aria-label={editor.t('palette.edit', { name: l.name })}
          aria-expanded={editingId === e.id}
          bind:this={pencils[e.id]}
          onclick={(ev) => openEditor(e.id, ev.currentTarget.parentElement as HTMLElement)}
        >
          <Icon name="pencil" size={16} />
        </button>
      </div>
    {/each}
  </div>
  <button
    type="button"
    class="btn add"
    aria-expanded={adding}
    bind:this={addButton}
    onclick={() => {
      editingId = null;
      adding = !adding;
    }}
  >
    <Icon name="plus" size={18} />
    {editor.t('palette.add')}
  </button>
  {#if editing}
    <Popover
      top={editTop}
      width={300}
      label={editor.t('palette.edit', { name: paletteRowLabels(editing, editor.locale).name })}
      ignore={pencils[editing.id] ?? null}
      onClose={closeEditor}
    >
      {#key editing.id}
        <PaletteEntryEditor
          {editor}
          entry={editing}
          inUse={counts.get(editing.id) ?? 0}
          onDone={() => closeEditor(true)}
        />
      {/key}
    </Popover>
  {/if}
  {#if adding}
    <Popover
      top={popoverTop(340, 480, window.innerHeight)}
      label={editor.t('palette.add')}
      ignore={addButton ?? null}
      onClose={closePicker}
    >
      <ColorPicker
        {editor}
        onClose={() => closePicker(true)}
        onPick={(spec) => (editor.addColor(spec), closePicker(true))}
      />
    </Popover>
  {/if}
</section>

<style>
  .palette {
    padding: 16px 16px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.02em;
  }
  .sm {
    font-size: 13px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .colr {
    position: relative;
    border: 1.5px solid transparent;
    border-radius: 10px;
  }
  .colr.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 7px 8px;
    border: 0;
    background: transparent;
    text-align: left;
    min-height: 0;
    min-width: 0;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .db {
    font-size: 12px;
  }
  .n {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--muted);
  }
  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .pencil {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    background: var(--surface);
  }
  .colr:hover .pencil,
  .colr:focus-within .pencil,
  .pencil[aria-expanded='true'] {
    opacity: 1;
  }
  .colr:hover .kbd,
  .colr:focus-within .kbd {
    visibility: hidden;
  }
  @media (pointer: coarse) {
    .pencil {
      opacity: 1;
    }
    .kbd {
      visibility: hidden;
    }
  }
  .add {
    width: 100%;
    margin-top: 6px;
    border-style: dashed;
  }
</style>
