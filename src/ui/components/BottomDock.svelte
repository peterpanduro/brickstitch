<script lang="ts">
  import { colourCounts, type ColorId } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { LONG_PRESS_MS, type Layout } from '../state/layout';
  import { paletteRowLabels } from '../state/palette';
  import { railKeyTarget, railTools } from '../state/rail';
  import { cycleIndex } from '../state/roving';
  import Icon from './Icon.svelte';

  /**
   * Touch dock (SPEC R51): colour strip (named swatches, "+ Ny färg", current colour with
   * "Byt eller ändra färg" on tablets; a summary line and long press on phones) and the tools.
   * Tapping the active tool asks for its options sheet.
   */
  let {
    editor,
    layout,
    onAdd,
    onEdit,
    onToolOptions,
  }: {
    editor: EditorStore;
    layout: Exclude<Layout, 'desktop'>;
    onAdd: (opener: HTMLElement) => void;
    onEdit: (id: ColorId, opener: HTMLElement) => void;
    onToolOptions: (opener: HTMLElement) => void;
  } = $props();

  const phone = $derived(layout === 'phone');
  const tools = $derived(railTools(editor.pattern.mode));
  const counts = $derived(colourCounts(editor.pattern));
  const entry = $derived(editor.pattern.palette.find((e) => e.id === editor.color));
  const labels = $derived(entry ? paletteRowLabels(entry, editor.locale) : undefined);
  const perPair = $derived(entry ? (counts.get(entry.id) ?? 0) * 2 : 0);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let held = false;

  function press(id: ColorId, el: HTMLElement): void {
    release();
    held = false;
    timer = setTimeout(() => {
      held = true;
      onEdit(id, el);
    }, LONG_PRESS_MS);
  }

  function release(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function pick(id: ColorId): void {
    if (held) held = false;
    else editor.setColor(id);
  }

  function radios(e: KeyboardEvent): HTMLElement[] {
    return [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')];
  }

  function onColourKey(e: KeyboardEvent): void {
    const pal = editor.pattern.palette;
    const i = cycleIndex(
      pal.length,
      pal.findIndex((x) => x.id === editor.color),
      e.key,
    );
    const next = i === null ? undefined : pal[i];
    if (!next) return;
    e.preventDefault();
    editor.setColor(next.id);
    radios(e)[i!]?.focus();
  }

  function onToolKey(e: KeyboardEvent): void {
    const ids = tools.map((x) => x.id);
    const next = railKeyTarget(ids, editor.tool, e.key);
    if (next === null) return;
    e.preventDefault();
    editor.setTool(next);
    radios(e)[ids.indexOf(next)]?.focus();
  }
</script>

<footer class="dock {layout}" data-testid="dock">
  {#if phone && entry && labels}
    <button
      type="button"
      class="curline"
      aria-label={editor.t('palette.edit', { name: labels.name })}
      aria-haspopup="dialog"
      onclick={(ev) => onEdit(entry.id, ev.currentTarget)}
    >
      <span class="b">{labels.name}</span>
      <span class="muted">
        {labels.db ? `${labels.db} · ` : ''}{editor.t('dock.perPair', { n: perPair })}
      </span>
      <span class="sp"></span>
      <span class="muted xs">{editor.t('dock.holdHint')}</span>
    </button>
  {/if}
  <div class="cols">
    <div class="strip">
      <div
        class="swatches"
        role="radiogroup"
        aria-label={editor.t('palette.heading')}
        tabindex="-1"
        onkeydown={onColourKey}
      >
        {#each editor.pattern.palette as e, i (e.id)}
          {@const on = editor.color === e.id}
          <button
            type="button"
            class="c"
            class:on
            role="radio"
            aria-checked={on}
            tabindex={on || (entry === undefined && i === 0) ? 0 : -1}
            data-colour={e.id}
            onpointerdown={(ev) => press(e.id, ev.currentTarget)}
            onpointerup={release}
            onpointercancel={release}
            onpointerleave={release}
            oncontextmenu={(ev) => ev.preventDefault()}
            onclick={() => pick(e.id)}
          >
            <span class="sw" style:--c={e.hex}></span>
            <span class="nm" class:sr-only={phone && !on}>
              {paletteRowLabels(e, editor.locale).name}
            </span>
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="c add"
        aria-label={editor.t('palette.add')}
        onclick={(ev) => onAdd(ev.currentTarget)}
      >
        <span class="sw dashed"><Icon name="plus" /></span>
        {#if !phone}<span class="nm" aria-hidden="true">{editor.t('dock.newColour')}</span>{/if}
      </button>
    </div>
    {#if !phone && entry && labels}
      <div class="cur">
        <div class="b">{labels.name}{labels.db ? ` · ${labels.db}` : ''}</div>
        <div class="sm muted">{editor.t('dock.beadsPerPair', { n: perPair })}</div>
        <button type="button" class="link" onclick={(ev) => onEdit(entry.id, ev.currentTarget)}>
          {editor.t('dock.change')}
        </button>
      </div>
    {/if}
  </div>
  <div
    class="tools"
    role="radiogroup"
    aria-label={editor.t('ui.tools')}
    tabindex="-1"
    onkeydown={onToolKey}
  >
    {#each tools as tool (tool.id)}
      {@const on = editor.tool === tool.id}
      <button
        type="button"
        class="tool"
        role="radio"
        aria-checked={on}
        tabindex={on ? 0 : -1}
        data-tool={tool.id}
        onclick={(ev) => (on ? onToolOptions(ev.currentTarget) : editor.setTool(tool.id))}
      >
        <Icon name={tool.icon} size={24} />
        {editor.t(phone && tool.id === 'eyedropper' ? 'dock.short.eyedropper' : tool.label)}
      </button>
    {/each}
  </div>
</footer>

<style>
  .dock {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px max(18px, env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid var(--line);
  }
  .phone {
    gap: 8px;
    padding: 10px 10px max(22px, env(safe-area-inset-bottom));
  }
  .curline {
    width: 100%;
    min-height: var(--control-lg);
    margin: -8px 0 -6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    white-space: nowrap;
  }
  .curline .xs {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .b {
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
  }
  .xs {
    font-size: 12px;
  }
  .sm {
    font-size: 13px;
  }
  .sp {
    flex: 1;
  }
  .cols {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .strip {
    display: flex;
    gap: 10px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    padding: 6px 4px;
    scrollbar-width: none;
  }
  .swatches {
    display: flex;
    gap: 10px;
  }
  .phone .strip,
  .phone .swatches {
    gap: 4px;
  }
  .c {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 64px;
    min-height: var(--control-lg);
    padding: 0;
    border: 0;
    background: none;
    font-size: 11px;
    color: var(--muted);
    -webkit-touch-callout: none;
    user-select: none;
  }
  .c:hover:not(:disabled) {
    background: none;
  }
  .c .sw {
    width: 48px;
    height: 40px;
    border-radius: 10px;
  }
  .c.on {
    color: var(--ink);
    font-weight: 650;
  }
  .c.on .sw {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }
  .nm {
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .phone .c {
    width: 48px;
  }
  .phone .c .sw {
    width: 40px;
    height: 33px;
    border-radius: 9px;
  }
  .dashed {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    box-shadow: none;
    border: 1.5px dashed var(--muted);
    color: var(--muted);
  }
  .cur {
    margin-left: auto;
    text-align: right;
    white-space: nowrap;
  }
  .link {
    min-height: var(--control-lg);
    margin: -10px 0 -12px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
  }
  .tools {
    display: flex;
    gap: 6px;
  }
  .tool {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 56px;
    padding: 9px 0 7px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: var(--muted);
  }
  .tool[aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .phone .tool {
    min-height: var(--control-lg);
    padding: 7px 0 5px;
    font-size: 11px;
  }
</style>
