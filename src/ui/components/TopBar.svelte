<script lang="ts">
  import type { Locale } from '../../core';
  import { savePill } from '../state/autosave';
  import type { EditorStore } from '../state/editor.svelte';
  import type { Layout } from '../state/layout';
  import { cycleIndex } from '../state/roving';
  import type { ViewNav } from '../state/route';
  import { shortcutHints } from '../shortcuts';
  import FileMenu from './FileMenu.svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  /**
   * Editor top bar (SPEC R46): logo, title, save pill, undo/redo, Arkiv, Från bild, print, SV/EN.
   * Tablet and phone variants (R51) use icon undo/redo and a "···" menu; the phone starts with
   * "‹" to the start page and prints from an icon button.
   */
  let {
    editor,
    nav,
    layout = 'desktop',
  }: { editor: EditorStore; nav: ViewNav; layout?: Layout } = $props();
  const desk = $derived(layout === 'desktop');
  const phone = $derived(layout === 'phone');

  const LOCALES: readonly Locale[] = ['sv', 'en'];
  let imagePicker = $state<HTMLInputElement>();
  let langButtons = $state<HTMLButtonElement[]>([]);
  const hints = shortcutHints(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
  const pill = $derived(savePill(editor.saveStatus));
  const saveError = $derived(editor.banners.saveError ?? editor.banners.loadError);
  const empty = $derived(!editor.analysis.instructions);

  function onPickImage(e: Event): void {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void nav.openImage(file, { source: 'editor' });
    input.value = '';
  }

  function onLangKey(e: KeyboardEvent): void {
    const i = cycleIndex(LOCALES.length, LOCALES.indexOf(editor.locale), e.key);
    const next = i === null ? undefined : LOCALES[i];
    if (!next) return;
    e.preventDefault();
    editor.setLocale(next);
    langButtons[i!]?.focus();
  }
</script>

<header class="top {layout}">
  {#if phone}
    <button
      type="button"
      class="btn ghost icon"
      aria-label={editor.t('ui.newPattern')}
      title={editor.t('ui.newPattern')}
      onclick={() => nav.go('new')}
    >
      <Icon name="chevron-left" />
    </button>
  {:else}
    <div class="brand" aria-hidden="true">
      <Logo />
      {#if desk}<span class="serif name">{editor.t('ui.appTitle')}</span>{/if}
    </div>
  {/if}
  {#if desk}<span class="vr"></span>{/if}
  <label class="title">
    <span class="sr-only">{editor.t('shell.rename')}</span>
    <input
      type="text"
      placeholder={editor.t('shell.untitled')}
      value={editor.pattern.title}
      onchange={(e) => editor.setTitle(e.currentTarget.value)}
      size={Math.max(10, (editor.pattern.title || editor.t('shell.untitled')).length)}
    />
    {#if desk}<Icon name="pencil" size={16} />{/if}
  </label>
  <span
    class="pill {pill.tone}"
    class:sr-only={phone}
    role="status"
    title={pill.tone === 'danger' && saveError ? editor.t(saveError) : undefined}
  >
    {#if pill.icon}<Icon name={pill.icon} size={14} />{/if}
    {editor.t(pill.key)}
  </span>
  <span class="spacer"></span>
  <button
    type="button"
    class="btn ghost"
    class:icon={!desk}
    aria-label={desk ? undefined : editor.t('ui.undo')}
    onclick={() => editor.undo()}
    disabled={!editor.canUndo}
    title={editor.t('ui.undoHint', { keys: hints.undo })}
  >
    <Icon name="undo" />{#if desk}{editor.t('ui.undo')}{/if}
  </button>
  <button
    type="button"
    class="btn ghost"
    class:icon={!desk}
    aria-label={desk ? undefined : editor.t('ui.redo')}
    onclick={() => editor.redo()}
    disabled={!editor.canRedo}
    title={editor.t('ui.redoHint', { keys: hints.redo })}
  >
    <Icon name="redo" />{#if desk}{editor.t('ui.redo')}{/if}
  </button>
  {#if desk}
    <span class="vr"></span>
    <FileMenu {editor} {nav} />
  {/if}
  {#if !phone}
    <button type="button" class="btn" onclick={() => imagePicker?.click()}>
      <Icon name="image" />{editor.t('shell.fromImage')}
    </button>
    <input bind:this={imagePicker} type="file" accept="image/*" hidden onchange={onPickImage} />
  {/if}
  <button
    type="button"
    class="btn primary"
    class:icon={phone}
    data-testid="open-print"
    disabled={empty}
    aria-label={phone ? editor.t('shell.print') : undefined}
    title={empty ? editor.t('ui.emptyPattern') : phone ? editor.t('shell.print') : undefined}
    onclick={() => nav.go('print')}
  >
    <Icon name="print" />{#if desk}{editor.t('shell.print')}{:else if !phone}{editor.t(
        'print.print',
      )}{/if}
  </button>
  {#if desk}
    <div class="seg" role="radiogroup" aria-label={editor.t('ui.language')}>
      {#each LOCALES as l, i (l)}
        <button
          bind:this={langButtons[i]}
          type="button"
          role="radio"
          lang={l}
          aria-checked={editor.locale === l}
          tabindex={editor.locale === l ? 0 : -1}
          onclick={() => editor.setLocale(l)}
          onkeydown={onLangKey}
        >
          {l.toUpperCase()}
        </button>
      {/each}
    </div>
  {:else}
    <FileMenu
      {editor}
      {nav}
      compact
      onFit={phone ? () => editor.setView('fit', false) : undefined}
    />
  {/if}
</header>

<style>
  .top {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    min-width: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-size: 17px;
  }
  .vr {
    width: 1px;
    height: 28px;
    background: var(--line);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    min-width: 0;
  }
  .title input {
    border: 1px solid transparent;
    background: transparent;
    font-weight: 600;
    font-size: 15px;
    color: var(--ink);
    padding: 6px 8px;
    min-width: 0;
    max-width: 22rem;
  }
  .title input:hover,
  .title input:focus {
    border-color: var(--line-strong);
    background: var(--surface);
  }
  .title input::placeholder {
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .seg button {
    min-width: 40px;
  }
  .phone {
    gap: 2px;
    padding: 0 8px 0 6px;
  }
  .tablet {
    gap: 10px;
  }
  .phone .title {
    flex: 0 1 auto;
    margin-left: 2px;
  }
  .phone .title input,
  .tablet .title input {
    width: 100%;
    max-width: none;
    text-overflow: ellipsis;
  }
  .phone .primary.icon {
    margin: 0 4px;
  }
</style>
