<script lang="ts">
  import { colourLabel, type ColorId, type PaletteEntry } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { normalizeHex, paletteRowLabels } from '../state/palette';

  /** Editor of one palette entry, shown in a popover: name, hex, remove with replacement. */
  let {
    editor,
    entry,
    inUse,
    onDone,
  }: { editor: EditorStore; entry: PaletteEntry; inUse: number; onDone: () => void } = $props();

  const others = $derived(editor.pattern.palette.filter((e) => e.id !== entry.id));
  let replacement = $state<ColorId | ''>('');
  const canRemove = $derived(
    inUse === 0 || (replacement !== '' && others.some((e) => e.id === replacement)),
  );
  let hexInvalid = $state(false);
  const hexErrorId = $derived(`hex-error-${entry.id}`);

  function setHex(v: string): void {
    const hex = normalizeHex(v);
    hexInvalid = hex === null;
    if (hex && hex !== entry.hex.toLowerCase()) {
      editor.updateColor(entry.id, { hex, approximate: false });
    }
  }

  function remove(): void {
    if (!canRemove) return;
    editor.removeColor(entry.id, replacement || undefined);
    onDone();
  }
</script>

<div class="entry-editor">
  <label>
    {editor.t('ui.name')}
    <input
      type="text"
      value={entry.name ?? ''}
      placeholder={paletteRowLabels(entry, editor.locale).name}
      onchange={(e) => editor.updateColor(entry.id, { name: e.currentTarget.value || undefined })}
    />
  </label>
  <label>
    {editor.t('ui.hex')}
    <span class="hex">
      <input type="color" value={entry.hex} onchange={(e) => setHex(e.currentTarget.value)} />
      <input
        type="text"
        value={entry.hex}
        aria-label={editor.t('ui.hex')}
        aria-invalid={hexInvalid}
        aria-describedby={hexInvalid ? hexErrorId : undefined}
        onchange={(e) => setHex(e.currentTarget.value)}
      />
    </span>
  </label>
  {#if hexInvalid}<p id={hexErrorId} class="error">{editor.t('ui.invalidHex')}</p>{/if}
  {#if others.length > 0}
    {#if inUse > 0}
      <p>{editor.t('ui.inUse', { n: inUse })}</p>
      <label>
        {editor.t('ui.replaceWith')}
        <select bind:value={replacement}>
          <option value="">—</option>
          {#each others as o (o.id)}
            <option value={o.id}>{colourLabel(o, editor.locale)}</option>
          {/each}
        </select>
      </label>
    {/if}
    <button type="button" class="btn danger" disabled={!canRemove} onclick={remove}>
      {editor.t('ui.remove')}
    </button>
  {/if}
  <button type="button" class="btn primary" onclick={onDone}>{editor.t('ui.done')}</button>
</div>

<style>
  .entry-editor {
    display: grid;
    gap: 10px;
  }
  label {
    display: grid;
    gap: 0.15rem;
    font-size: 13px;
  }
  .error {
    color: var(--danger);
  }
  [aria-invalid='true'] {
    border-color: var(--danger);
  }
  .hex {
    display: flex;
    gap: 0.25rem;
  }
  .hex input[type='text'] {
    flex: 1;
    min-width: 0;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
  }
</style>
