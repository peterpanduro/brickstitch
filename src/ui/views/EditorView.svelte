<script lang="ts">
  import type { ColorId } from '../../core';
  import BannerList from '../components/BannerList.svelte';
  import BottomDock from '../components/BottomDock.svelte';
  import Canvas from '../components/Canvas.svelte';
  import Checklist from '../components/Checklist.svelte';
  import ChipRow from '../components/ChipRow.svelte';
  import ColorPicker from '../components/ColorPicker.svelte';
  import PalettePanel from '../components/PalettePanel.svelte';
  import PaletteEntryEditor from '../components/PaletteEntryEditor.svelte';
  import Popover from '../components/Popover.svelte';
  import RealSizePair from '../components/RealSizePair.svelte';
  import SizeTiles from '../components/SizeTiles.svelte';
  import ToolCard from '../components/ToolCard.svelte';
  import ToolRail from '../components/ToolRail.svelte';
  import TopBar from '../components/TopBar.svelte';
  import ZoomBar from '../components/ZoomBar.svelte';
  import { colourCounts } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { hintSeen, layoutFor, markHintSeen, touchViewPad } from '../state/layout';
  import { paletteRowLabels } from '../state/palette';
  import { railTools } from '../state/rail';
  import { REAL_SIZE_BOX } from '../state/real-size';
  import type { ViewNav } from '../state/route';
  import { PX_PER_MM } from '../state/zoom';
  import { localStore } from '../storage';

  /**
   * Editor (SPEC R46): top bar, rail | canvas with overlay slots (tool card, real-size pair,
   * zoom bar, toasts) | right panel (palette, checklist, size tiles). Below 1024 px the touch
   * layout (R51): canvas with floating chips, real-size card, zoom stack and hint over the
   * bottom dock; checklist, size, tool options and colours open as bottom sheets.
   */
  let { editor, nav }: { editor: EditorStore; nav: ViewNav } = $props();
  let fit = $state(1);
  let cardW = $state(0);
  let cardH = $state(0);
  let width = $state(window.innerWidth);
  let height = $state(window.innerHeight);
  let dockH = $state(0);

  type Sheet = { kind: 'checklist' | 'size' | 'tool' | 'picker' } | { kind: 'entry'; id: ColorId };
  let sheet = $state.raw<Sheet | null>(null);
  let opener = $state.raw<HTMLElement | null>(null);
  let hint = $state(!hintSeen(localStore()));

  const layout = $derived(layoutFor(width));
  const touch = $derived(layout === 'desktop' ? null : layout);
  const editing = $derived.by(() => {
    const s = sheet;
    return s?.kind === 'entry' ? editor.pattern.palette.find((e) => e.id === s.id) : undefined;
  });
  const toolLabel = $derived(
    editor.t(railTools('shaped').find((x) => x.id === editor.tool)?.label ?? 'ui.tools'),
  );
  const phoneBox = $derived({
    width: Math.max(20, (width - 60) / PX_PER_MM),
    height: Math.max(30, (height * 0.5) / PX_PER_MM),
  });

  $effect(() => {
    if (!touch) sheet = null;
  });

  function open(next: Sheet, el: HTMLElement): void {
    opener = el;
    sheet = next;
  }

  function close(refocus = false): void {
    sheet = null;
    if (refocus) queueMicrotask(() => opener?.focus());
  }

  function dismissHint(): void {
    if (!hint) return;
    hint = false;
    markHintSeen(localStore());
  }

  function startRow(): void {
    const r = editor.analysis.ladderRow;
    document
      .querySelector(`.canvas-wrap [data-row="${r}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  function sheetLabel(s: Sheet): string {
    if (s.kind === 'checklist') return editor.t('check.heading');
    if (s.kind === 'size') return editor.t('size.realSize');
    if (s.kind === 'tool') return editor.t('dock.options', { tool: toolLabel });
    if (s.kind === 'picker') return editor.t('palette.add');
    return editing
      ? editor.t('palette.edit', { name: paletteRowLabels(editing, editor.locale).name })
      : '';
  }
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

{#if !touch}
  <div class="editor" data-view="editor">
    <h1 class="sr-only" tabindex="-1">{editor.pattern.title || editor.t('shell.untitled')}</h1>
    <TopBar {editor} {nav} />
    <div class="rail" data-region="rail">
      <ToolRail {editor} />
    </div>
    <main class="stage" data-region="canvas">
      <Canvas {editor} bind:fit toolCard={{ width: cardW, height: cardH }} />
      <div
        class="slot tool-card"
        data-slot="tool-card"
        bind:clientWidth={cardW}
        bind:clientHeight={cardH}
      >
        <ToolCard {editor} />
      </div>
      <div class="slot real-size" data-slot="real-size">
        <RealSizePair
          pattern={editor.pattern}
          analysis={editor.analysis}
          box={REAL_SIZE_BOX.desktop}
          collapsible
          locale={editor.locale}
          t={editor.t}
          onShowRealSize={() => editor.setView(editor.settings.zoom, true)}
        />
      </div>
      <div class="slot zoom-bar" data-slot="zoom-bar"><ZoomBar {editor} {fit} /></div>
      <div class="slot toasts" data-slot="toasts">
        <BannerList {editor} />
      </div>
    </main>
    <aside class="side" data-region="side">
      <div data-region="palette"><PalettePanel {editor} /></div>
      <div data-region="checklist"><Checklist {editor} /></div>
      <div data-region="size-tiles"><SizeTiles {editor} /></div>
    </aside>
  </div>
{:else}
  <div class="editor-touch {touch}" data-view="editor" data-layout={touch}>
    <h1 class="sr-only" tabindex="-1">{editor.pattern.title || editor.t('shell.untitled')}</h1>
    <TopBar {editor} {nav} layout={touch} />
    <main class="stage" data-region="canvas">
      <Canvas
        {editor}
        bind:fit
        base={touchViewPad(touch)}
        startPill={touch === 'tablet'}
        onPinch={dismissHint}
      />
      <div class="slot chips" data-slot="chips">
        <ChipRow
          {editor}
          layout={touch}
          onChecklist={(el) => open({ kind: 'checklist' }, el)}
          onSize={(el) => open({ kind: 'size' }, el)}
          onStartRow={startRow}
        />
      </div>
      {#if touch === 'tablet'}
        <div class="slot real-size" data-slot="real-size">
          <RealSizePair
            pattern={editor.pattern}
            analysis={editor.analysis}
            box={REAL_SIZE_BOX.tablet}
            collapsible
            compact
            locale={editor.locale}
            t={editor.t}
            onShowRealSize={() => editor.setView(editor.settings.zoom, true)}
          />
        </div>
        <div class="slot zoom-stack" data-slot="zoom-bar"><ZoomBar {editor} {fit} stack /></div>
        {#if hint}
          <button
            type="button"
            class="slot hint float"
            title={editor.t('dock.hintDismiss')}
            onclick={dismissHint}
          >
            {editor.t('dock.hint')}
          </button>
        {/if}
      {/if}
      <div class="slot toasts" data-slot="toasts">
        <BannerList {editor} />
      </div>
    </main>
    <div class="dock-wrap" bind:clientHeight={dockH}>
      <BottomDock
        {editor}
        layout={touch}
        onAdd={(el) => open({ kind: 'picker' }, el)}
        onEdit={(id, el) => open({ kind: 'entry', id }, el)}
        onToolOptions={(el) => (sheet?.kind === 'tool' ? close() : open({ kind: 'tool' }, el))}
      />
    </div>
    {#if sheet && (sheet.kind !== 'entry' || editing)}
      <Popover sheet bottom={dockH} label={sheetLabel(sheet)} ignore={opener} onClose={close}>
        <div class="sheet-body">
          {#if sheet.kind === 'checklist'}
            <Checklist
              {editor}
              onAction={(k) => (k === 'show' || k === 'focusLadder') && close()}
            />
          {:else if sheet.kind === 'size'}
            <RealSizePair
              pattern={editor.pattern}
              analysis={editor.analysis}
              box={touch === 'phone' ? phoneBox : REAL_SIZE_BOX.tablet}
              locale={editor.locale}
              t={editor.t}
              onShowRealSize={() => (editor.setView(editor.settings.zoom, true), close())}
            />
          {:else if sheet.kind === 'tool'}
            <ToolCard {editor} />
          {:else if sheet.kind === 'picker'}
            <ColorPicker
              {editor}
              onClose={() => close(true)}
              onPick={(spec) => (editor.addColor(spec), close(true))}
            />
          {:else if editing}
            {#key editing.id}
              <PaletteEntryEditor
                {editor}
                entry={editing}
                inUse={colourCounts(editor.pattern).get(editing.id) ?? 0}
                onDone={() => close(true)}
              />
            {/key}
          {/if}
        </div>
      </Popover>
    {/if}
  </div>
{/if}

<style>
  .editor {
    display: grid;
    grid-template: 60px minmax(0, 1fr) / 80px minmax(0, 1fr) var(--side-w);
    height: 100dvh;
  }
  .rail {
    background: var(--surface);
    border-right: 1px solid var(--line);
    padding: 12px 4px;
    overflow-y: auto;
  }
  .stage {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    background:
      radial-gradient(circle at 1px 1px, rgba(120, 100, 70, 0.13) 1px, transparent 1.5px) 0 0 / 18px
        18px,
      var(--bg);
  }
  .slot {
    position: absolute;
    z-index: 2;
  }
  .slot:empty {
    display: none;
  }
  .tool-card {
    left: 16px;
    top: 14px;
    max-height: calc(100% - 30px);
    overflow: auto;
  }
  .real-size {
    right: 16px;
    top: 56px;
    width: 236px;
  }
  .zoom-bar {
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
  }
  .toasts {
    left: 50%;
    top: 56px;
    transform: translateX(-50%);
    width: min(32rem, calc(100% - 32px));
  }
  .side {
    background: var(--surface);
    border-left: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    min-height: 0;
  }
  .side :global(.palette) {
    width: auto;
    border-right: 0;
  }
  .editor-touch {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }
  .editor-touch :global(.top) {
    flex: none;
    height: 60px;
  }
  .editor-touch.phone :global(.top) {
    height: 52px;
  }
  .editor-touch .stage {
    flex: 1;
  }
  .chips {
    left: 14px;
    top: 14px;
    max-width: calc(100% - 28px);
  }
  .phone .chips {
    left: 10px;
    top: 10px;
    max-width: calc(100% - 10px);
  }
  .editor-touch .real-size {
    top: 14px;
    right: 14px;
    width: auto;
  }
  .zoom-stack {
    right: 14px;
    bottom: 14px;
  }
  .hint {
    left: 14px;
    bottom: 14px;
    min-height: var(--control);
    padding: 8px 12px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--muted);
  }
  .editor-touch .toasts {
    top: 72px;
  }
  .dock-wrap {
    flex: none;
  }
  .sheet-body :global(.card) {
    width: auto;
    margin: 0;
    border: 0;
    box-shadow: none;
    padding: 0;
  }
</style>
