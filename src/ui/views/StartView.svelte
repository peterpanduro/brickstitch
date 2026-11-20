<script lang="ts">
  import { tick } from 'svelte';
  import {
    BEAD_TYPES,
    formatMm,
    SEED_CATALOG,
    seedByDb,
    type BeadTypeId,
    type PatternMode,
  } from '../../core';
  import BannerList from '../components/BannerList.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import RealSizePair from '../components/RealSizePair.svelte';
  import ShapeCard from '../components/ShapeCard.svelte';
  import type { EditorStore } from '../state/editor.svelte';
  import { fileKind } from '../state/file';
  import {
    activePreset,
    beadEstimate,
    buildNewPattern,
    cancelPending,
    choiceSizeMm,
    confirmPending,
    importTarget,
    requestAction,
    SIZE_LIMITS,
    START_PREVIEW_BOX,
    withMode,
    withPreset,
    withSize,
    type StartAction,
    type StartFlow,
    type StartMethod,
    type StartState,
  } from '../state/new-pattern';
  import { sizePresets } from '../state/presets';
  import { sliderFill } from '../state/slider';
  import { pairLayout } from '../state/real-size';
  import type { ViewNav } from '../state/route';

  /**
   * "Nytt mönster" start page (`#/new`, SPEC R55). `start` survives leaving the view (kept by
   * the app for the session). Anything that replaces the pattern goes through
   * {@link request}, which shows the inline confirmation first when the pattern is dirty.
   */
  let {
    editor,
    nav,
    start = $bindable(),
  }: { editor: EditorStore; nav: ViewNav; start: StartState } = $props();

  const QUICK_BACKGROUNDS = ['DB-200', 'DB-1137', 'DB-010'] as const;
  const METHODS: readonly { id: StartMethod; icon: 'brush' | 'image' }[] = [
    { id: 'draw', icon: 'brush' },
    { id: 'image', icon: 'image' },
  ];
  const SHAPES: readonly PatternMode[] = ['panel', 'shaped'];
  const BEADS: readonly BeadTypeId[] = ['delica11', 'delica15'];

  let flow = $state<StartFlow<File>>({ pending: null });
  let imagePicker = $state<HTMLInputElement>();
  let filePicker = $state<HTMLInputElement>();
  let replaceButton = $state<HTMLButtonElement>();
  let cta = $state<HTMLButtonElement>();

  const t = $derived(editor.t);
  const c = $derived(start.choice);
  const mm = $derived(choiceSizeMm(c));
  const estimate = $derived(beadEstimate(c));
  const preview = $derived(buildNewPattern(c));
  const preset = $derived(activePreset(c));
  const outlineLayout = $derived(pairLayout(mm, START_PREVIEW_BOX));
  const fmt = (n: number) => formatMm(editor.locale, n);
  const dim = (n: number) => String(n).replace('.', editor.locale === 'sv' ? ',' : '.');
  const bgName = $derived.by(() => {
    const s = seedByDb(c.background);
    return s ? `${s.names[editor.locale]} · ${s.db}` : c.background;
  });

  function setChoice(next: StartState['choice']): void {
    start.choice = next;
  }

  async function handleFile(file: File): Promise<void> {
    if (fileKind(file) === 'image') {
      await nav.openImage(file, importTarget(start));
      return;
    }
    editor.open(await file.text());
    if (!editor.banners.openError) nav.leave();
  }

  function run(a: StartAction<File> | null): void {
    if (!a) return;
    if (a.kind === 'create') {
      editor.newPattern(c);
      nav.leave();
    } else if (a.kind === 'pick') (a.pick === 'image' ? imagePicker : filePicker)?.click();
    else void handleFile(a.file);
  }

  async function request(a: StartAction<File>): Promise<void> {
    const r = requestAction(flow, a, editor.newNeedsConfirm);
    flow = r.flow;
    run(r.run);
    if (flow.pending) {
      await tick();
      replaceButton?.focus();
    }
  }

  function confirm(): void {
    const r = confirmPending(flow);
    flow = r.flow;
    run(r.run);
  }

  async function onPick(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await handleFile(file);
  }

  /** Handles a file dropped on the page: image → import with the page's choice, file → open. */
  export function drop(file: File): void {
    void request({ kind: 'drop', file });
  }

  async function cancel(): Promise<void> {
    flow = cancelPending(flow);
    await tick();
    cta?.focus();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (flow.pending) void cancel();
    else nav.leave();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="pg" data-view="new">
  <header class="top">
    <Logo />
    <h1 tabindex="-1">{t('shell.view.new')}</h1>
    <button
      type="button"
      class="btn ghost icon close"
      aria-label={t('ui.close')}
      title={t('ui.close')}
      onclick={() => nav.leave()}
    >
      <Icon name="close" />
    </button>
  </header>

  <main class="left">
    <section>
      <h2><span class="no">1</span>{t('start.method.heading')}</h2>
      <div class="row">
        {#each METHODS as m (m.id)}
          <label class="big" class:on={start.method === m.id}>
            <input
              type="radio"
              name="start-method"
              class="sr-only"
              checked={start.method === m.id}
              onchange={() => ((start.method = m.id), (flow = cancelPending(flow)))}
            />
            <span class="ic"><Icon name={m.icon} size={24} /></span>
            <span class="grow">
              <span class="b">{t(`start.method.${m.id}`)}</span>
              <span class="hint">{t(`start.method.${m.id}Hint`)}</span>
            </span>
            <span class="radio" class:on={start.method === m.id}></span>
          </label>
        {/each}
      </div>
    </section>

    <section>
      <h2><span class="no">2</span>{t('start.shape.heading')}</h2>
      <div class="row stretch">
        {#each SHAPES as s (s)}
          <ShapeCard
            kind={s}
            title={t(`start.shape.${s}`)}
            hint={t(`start.shape.${s}Hint`)}
            checked={c.mode === s}
            onselect={() => setChoice(withMode(c, s))}
          />
        {/each}
      </div>
    </section>

    <section>
      <h2>
        <span class="no">3</span>{t('start.size.heading')}
        <span class="seg" role="radiogroup" aria-label={t('start.size.heading')}>
          {#each sizePresets(c.mode) as p (p.id)}
            <label class:on={preset === p.id}>
              <input
                type="radio"
                name="start-preset"
                class="sr-only"
                checked={preset === p.id}
                onchange={() => setChoice(withPreset(c, p.id))}
              />
              {t(p.labelKey)}
            </label>
          {/each}
        </span>
      </h2>
      <div class="size">
        <div>
          <label class="row" for="start-width">
            <span>{t('start.size.width')}</span>
            <span class="v num">{t('start.size.mm', { mm: fmt(mm.width) })}</span>
            <span class="muted sm">{t('start.size.beads', { n: c.width })}</span>
          </label>
          <input
            id="start-width"
            type="range"
            class="slider"
            min={SIZE_LIMITS.width.min}
            max={SIZE_LIMITS.width.max}
            value={c.width}
            style:--fill={sliderFill(c.width, SIZE_LIMITS.width.min, SIZE_LIMITS.width.max)}
            aria-valuetext="{fmt(mm.width)} mm, {t('start.size.beads', { n: c.width })}"
            oninput={(e) => setChoice(withSize(c, { width: e.currentTarget.valueAsNumber }))}
          />
        </div>
        <div>
          <label class="row" for="start-height">
            <span>{t('start.size.height')}</span>
            <span class="v num">{t('start.size.mm', { mm: fmt(mm.height) })}</span>
            <span class="muted sm">{t('start.size.rows', { n: c.height })}</span>
          </label>
          <input
            id="start-height"
            type="range"
            class="slider"
            min={SIZE_LIMITS.height.min}
            max={SIZE_LIMITS.height.max}
            value={c.height}
            style:--fill={sliderFill(c.height, SIZE_LIMITS.height.min, SIZE_LIMITS.height.max)}
            aria-valuetext="{fmt(mm.height)} mm, {t('start.size.rows', { n: c.height })}"
            oninput={(e) => setChoice(withSize(c, { height: e.currentTarget.valueAsNumber }))}
          />
        </div>
      </div>
    </section>

    <section>
      <h2><span class="no">4</span>{t('start.bead.heading')}</h2>
      <div class="row">
        {#each BEADS as b (b)}
          <label class="bead" class:on={c.beadType === b}>
            <input
              type="radio"
              name="start-bead"
              class="sr-only"
              checked={c.beadType === b}
              onchange={() => setChoice({ ...c, beadType: b })}
            />
            <span class="radio" class:on={c.beadType === b}></span>
            <span class="grow">
              <span class="b">
                {t(`bead.${b}`)}
                {#if b === 'delica11'}<span class="pill acc">{t('start.bead.common')}</span>{/if}
              </span>
              <span class="hint">
                {t(`start.bead.${b}`, {
                  w: dim(BEAD_TYPES[b].widthMm),
                  h: dim(BEAD_TYPES[b].rowPitchMm),
                })}
              </span>
            </span>
          </label>
        {/each}
        {#if c.mode === 'panel'}
          <div class="bead bg">
            <span class="grow">
              <span class="b">{t('start.bg.label')}</span>
              <span class="hint">{bgName}</span>
            </span>
            <span class="swatches" role="radiogroup" aria-label={t('start.bg.label')}>
              {#each QUICK_BACKGROUNDS as db (db)}
                <label class="swatch-pick" class:on={c.background === db}>
                  <input
                    type="radio"
                    name="start-bg"
                    class="sr-only"
                    checked={c.background === db}
                    onchange={() => setChoice({ ...c, background: db })}
                  />
                  <span
                    class="sw"
                    style:--c={seedByDb(db)?.hex}
                    title={seedByDb(db)?.names[editor.locale]}
                  ></span>
                  <span class="sr-only">{seedByDb(db)?.names[editor.locale]}</span>
                </label>
              {/each}
            </span>
            <span class="more-wrap">
              <Icon name="plus" />
              <select
                class="more"
                aria-label={t('start.bg.more')}
                title={t('start.bg.more')}
                value={c.background}
                onchange={(e) => setChoice({ ...c, background: e.currentTarget.value })}
              >
                {#each SEED_CATALOG as s (s.db)}
                  <option value={s.db}>{s.names[editor.locale]} · {s.db}</option>
                {/each}
              </select>
            </span>
          </div>
        {/if}
      </div>
    </section>

    <section class="more-row">
      <div class="row">
        <span class="b sm">{t('start.continue.heading')}</span>
        {#if editor.hasRealPattern}
          <button type="button" class="rec" data-testid="continue" onclick={() => nav.leave()}>
            <span class="grow">
              <span class="b sm">
                {t('start.continue.with', {
                  title: editor.pattern.title || t('shell.untitled'),
                })}
              </span>
              <span class="xs muted">{t('start.continue.hint')}</span>
            </span>
          </button>
        {/if}
        <button
          type="button"
          class="rec"
          data-testid="open-file"
          onclick={() => request({ kind: 'pick', pick: 'file' })}
        >
          <Icon name="folder" />
          <span class="b sm">{t('shell.openFile')}</span>
        </button>
      </div>
    </section>
  </main>

  <aside class="right">
    <div class="row">
      <Icon name="ruler" />
      <h2 class="head">{t('start.preview.heading')}</h2>
      <span class="sp"></span>
      <span class="sm muted">{t('start.preview.note')}</span>
    </div>
    <div class="pvbox">
      {#if c.mode === 'panel'}
        <RealSizePair pattern={preview} box={START_PREVIEW_BOX} locale={editor.locale} {t} />
      {:else if outlineLayout === 'none'}
        <p class="muted">{t('size.tooBig')}</p>
      {:else}
        <div class="outline-pair" aria-hidden="true">
          {#each outlineLayout === 'pair' ? [0, 1] : [0] as i (i)}
            <span style:width="{mm.width}mm" style:height="{mm.height}mm"></span>
          {/each}
        </div>
      {/if}
    </div>
    <div class="sum">
      <div>
        <b class="num">{fmt(mm.width)} × {fmt(mm.height)}</b>
        <span class="xs muted">{t('start.tile.size')}</span>
      </div>
      <div>
        <b class="num">{c.height}</b>
        <span class="xs muted">{t('start.tile.rows')}</span>
      </div>
      <div>
        <b class="num">
          {t(estimate.exact ? 'start.tile.about' : 'start.tile.upTo', { n: estimate.count })}
        </b>
        <span class="xs muted">{t('start.tile.beads')}</span>
      </div>
    </div>
    <div class="notes">
      <h3>{t('start.notes.heading')}</h3>
      <p><Icon name="start" size={18} />{t('start.notes.startRow')}</p>
      <p><Icon name="grid" size={18} />{t('start.notes.offset')}</p>
      <p><Icon name="info" size={18} />{t('start.notes.pair')}</p>
    </div>
    {#if flow.pending}
      <div class="confirm" role="alert">
        <p>{t('ui.confirmReplace')}</p>
        {#if editor.banners.loadError}<p class="note">{t('ui.confirmOverwriteStored')}</p>{/if}
        <div class="row">
          <button type="button" class="btn" onclick={cancel}>
            {t('ui.back')}
          </button>
          <button type="button" class="btn primary" bind:this={replaceButton} onclick={confirm}>
            {t('ui.replace')}
          </button>
        </div>
      </div>
    {/if}
    <button
      type="button"
      class="btn primary lg"
      bind:this={cta}
      data-testid="create-pattern"
      onclick={() =>
        request(start.method === 'draw' ? { kind: 'create' } : { kind: 'pick', pick: 'image' })}
    >
      {t(start.method === 'draw' ? 'start.create' : 'start.pickImage')}
      <Icon name="chevron" />
    </button>
  </aside>

  <div class="toasts"><BannerList {editor} /></div>
  <input bind:this={imagePicker} type="file" accept="image/*" hidden onchange={onPick} />
  <input
    bind:this={filePicker}
    type="file"
    accept=".json,application/json"
    hidden
    onchange={onPick}
  />
</div>

<style>
  .pg {
    display: grid;
    grid-template: 64px minmax(0, 1fr) / minmax(0, 1fr) 430px;
    min-height: 100dvh;
    background: var(--bg);
  }
  .top {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0 auto 0 6px;
    font-size: 20px;
  }
  .left {
    padding: 26px 40px 32px 48px;
    display: flex;
    flex-direction: column;
    gap: 26px;
    min-width: 0;
  }
  h2 {
    margin: 0 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0;
  }
  h2 .seg {
    margin-left: auto;
  }
  .no {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row.stretch {
    align-items: stretch;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .sp {
    flex: 1;
  }
  .b {
    display: block;
    font-weight: 600;
  }
  .hint {
    display: block;
    font-size: 13px;
    color: var(--muted);
  }
  .big,
  .bead {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1.5px solid var(--line);
    border-radius: var(--r-float);
    background: var(--surface);
    cursor: pointer;
  }
  .big {
    gap: 14px;
    padding: 14px 16px;
  }
  .big .b {
    font-size: 15px;
  }
  .big.on,
  .bead.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .big:has(:focus-visible),
  .bead:has(:focus-visible),
  .seg label:has(:focus-visible),
  .swatch-pick:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .ic {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .big.on .ic {
    background: var(--surface);
  }
  .radio {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--muted);
    flex: none;
    box-sizing: border-box;
  }
  .radio.on {
    border: 6px solid var(--accent);
  }
  .bead .b .pill {
    height: 20px;
    margin-left: 6px;
  }
  .bead.bg {
    flex: 1.1;
    cursor: default;
    background: var(--surface);
    border-color: var(--line);
  }
  .swatch-pick {
    display: inline-flex;
    cursor: pointer;
    border-radius: 7px;
  }
  .swatch-pick.on {
    outline: 2.5px solid var(--accent);
    outline-offset: 2px;
  }
  .swatches {
    display: inline-flex;
    gap: 12px;
  }
  .more-wrap {
    position: relative;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
  }
  .more {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .more-wrap:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .seg label {
    cursor: pointer;
  }
  .size {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .size .row {
    gap: 8px;
    margin-bottom: 6px;
  }
  .size .row > :first-child {
    margin-right: auto;
  }
  .size input {
    width: 100%;
    margin: 0;
  }
  .v {
    font-size: 20px;
    font-weight: 650;
  }
  .more-row {
    border-top: 1px solid var(--line);
    padding-top: 18px;
  }
  .rec {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 62px;
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .rec .xs {
    display: block;
  }
  .right {
    background: var(--surface);
    border-left: 1px solid var(--line);
    padding: 26px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .head {
    margin: 0;
    font-size: 15px;
  }
  .outline-pair {
    display: flex;
    gap: 6mm;
  }
  .outline-pair span {
    max-width: 100%;
    border: 2px dashed var(--muted);
    border-radius: 40% 40% 50% 50%;
    opacity: 0.6;
  }
  .pvbox {
    min-height: 300px;
    border-radius: var(--r-float);
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }
  .sum {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .sum div {
    padding: 10px 12px;
    border-radius: var(--r-control);
    background: var(--surface-2);
  }
  .sum b {
    display: block;
    font-size: 16px;
    white-space: nowrap;
  }
  .notes {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }
  .notes h3 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 13px;
    letter-spacing: 0;
  }
  .notes p {
    margin: 0;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .notes :global(svg) {
    flex: none;
    color: var(--accent);
  }
  .confirm {
    padding: 10px 12px;
    border-radius: var(--r-control);
    background: var(--warn-soft);
    color: var(--warn);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  .confirm p {
    margin: 0;
  }
  .confirm .row {
    justify-content: flex-end;
  }
  .toasts {
    position: fixed;
    left: 50%;
    top: 72px;
    transform: translateX(-50%);
    width: min(32rem, calc(100% - 32px));
    z-index: 5;
  }
  @media (max-width: 1023px) {
    .pg {
      grid-template: 64px auto auto / minmax(0, 1fr);
      padding-bottom: 88px;
    }
    .left {
      padding: 24px 24px 8px;
    }
    .right {
      border-left: 0;
      border-top: 1px solid var(--line);
      padding: 24px;
    }
    .right > .btn.lg {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 4;
      box-shadow: var(--shadow);
    }
    .confirm {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(max(16px, env(safe-area-inset-bottom)) + var(--control-lg) + 8px);
      z-index: 4;
      box-shadow: var(--shadow);
    }
  }
  @media (max-width: 599px) {
    .top {
      padding: 0 8px 0 16px;
    }
    .left,
    .right {
      padding-left: 16px;
      padding-right: 16px;
    }
    .row {
      flex-wrap: wrap;
    }
    .sum {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
