<script lang="ts">
  import { tick } from 'svelte';
  import type { Locale } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { cycleIndex } from '../state/roving';
  import type { ViewNav } from '../state/route';
  import type { Theme } from '../state/settings';
  import { download } from '../storage';
  import Icon from './Icon.svelte';

  /**
   * "Arkiv" menu (SPEC R46): Nytt mönster, Öppna fil…, Spara som fil and Utseende (R45). On touch
   * layouts (R51) it is the "···" menu (`compact`), which also holds the language and, on phones,
   * "Visa allt" (`onFit`).
   */
  let {
    editor,
    nav,
    compact = false,
    onFit,
  }: { editor: EditorStore; nav: ViewNav; compact?: boolean; onFit?: () => void } = $props();

  const LOCALES: readonly { id: Locale; label: string }[] = [
    { id: 'sv', label: 'Svenska' },
    { id: 'en', label: 'English' },
  ];

  const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let picker = $state<HTMLInputElement>();

  const items = (): HTMLElement[] =>
    menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];

  async function toggle(): Promise<void> {
    open = !open;
    if (!open) return;
    await tick();
    items()[0]?.focus();
  }

  function close(refocus = true): void {
    open = false;
    if (refocus) button?.focus();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    const list = items();
    const i = cycleIndex(list.length, list.indexOf(document.activeElement as HTMLElement), e.key);
    if (i === null) return;
    e.preventDefault();
    list[i]?.focus();
  }

  function run(f: () => void): void {
    close();
    f();
  }

  async function onPick(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) editor.open(await file.text());
    input.value = '';
  }

  function save(): void {
    const { name, text } = editor.saveFile();
    download(name, text);
  }
</script>

<svelte:window
  onpointerdown={(e) =>
    open &&
    !menu?.contains(e.target as Node) &&
    !button?.contains(e.target as Node) &&
    close(false)}
/>

<div class="file">
  <button
    bind:this={button}
    type="button"
    class="btn ghost"
    class:icon={compact}
    aria-label={compact ? editor.t('shell.more') : undefined}
    title={compact ? editor.t('shell.more') : undefined}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="file-menu"
    onclick={toggle}
  >
    {#if compact}<Icon name="more" />{:else}<Icon name="folder" />{editor.t('shell.file')}{/if}
  </button>
  {#if open}
    <div
      bind:this={menu}
      id="file-menu"
      class="menu float"
      role="menu"
      aria-label={editor.t(compact ? 'shell.more' : 'shell.file')}
      tabindex="-1"
      onkeydown={onKey}
    >
      <button type="button" role="menuitem" tabindex="-1" onclick={() => run(() => nav.go('new'))}>
        <Icon name="plus" />{editor.t('ui.newPattern')}
      </button>
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        onclick={() => run(() => picker?.click())}
      >
        <Icon name="folder" />{editor.t('shell.openFile')}
      </button>
      <button type="button" role="menuitem" tabindex="-1" onclick={() => run(save)}>
        <Icon name="download" />{editor.t('shell.saveFile')}
      </button>
      {#if onFit}
        <button type="button" role="menuitem" tabindex="-1" onclick={() => run(onFit)}>
          <Icon name="grid" />{editor.t('size.zoomFit')}
        </button>
      {/if}
      <div class="sep" role="separator"></div>
      <div role="group" aria-labelledby="theme-label">
        <div id="theme-label" class="label">{editor.t('theme.label')}</div>
        {#each THEMES as th (th)}
          <button
            type="button"
            role="menuitemradio"
            tabindex="-1"
            aria-checked={editor.theme === th}
            onclick={() => editor.setTheme(th)}
          >
            <span class="mark">
              {#if editor.theme === th}<Icon name="check" size={16} />{/if}
            </span>
            {editor.t(`theme.${th}`)}
          </button>
        {/each}
      </div>
      {#if compact}
        <div class="sep" role="separator"></div>
        <div role="group" aria-labelledby="lang-label">
          <div id="lang-label" class="label">{editor.t('ui.language')}</div>
          {#each LOCALES as l (l.id)}
            <button
              type="button"
              role="menuitemradio"
              tabindex="-1"
              lang={l.id}
              aria-checked={editor.locale === l.id}
              onclick={() => editor.setLocale(l.id)}
            >
              <span class="mark">
                {#if editor.locale === l.id}<Icon name="check" size={16} />{/if}
              </span>
              {l.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <input bind:this={picker} type="file" accept=".json,application/json" hidden onchange={onPick} />
</div>

<style>
  .file {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    min-width: 14rem;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--control);
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--surface-2);
  }
  .mark {
    display: inline-flex;
    width: 20px;
    justify-content: center;
    color: var(--accent);
  }
  .sep {
    height: 1px;
    margin: 6px 4px;
    background: var(--line);
  }
  @media (pointer: coarse) {
    .menu button {
      min-height: var(--control-lg);
    }
  }
  .label {
    padding: 6px 10px 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
</style>
