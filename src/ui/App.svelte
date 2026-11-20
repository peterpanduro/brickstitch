<script lang="ts">
  import { tick } from 'svelte';
  import type { RgbaImage } from '../core';
  import EditorView from './views/EditorView.svelte';
  import ImportView from './views/ImportView.svelte';
  import PrintView from './views/PrintView.svelte';
  import StartView from './views/StartView.svelte';
  import { EditorStore } from './state/editor.svelte';
  import { dropAllowed, fileKind } from './state/file';
  import type { ImportTarget } from './state/import-wizard';
  import { initialStartState } from './state/new-pattern';
  import { createRouter, type Route, type ViewNav } from './state/route';
  import { themeAttribute } from './state/settings';
  import { decodeImage } from './image';
  import { shortcut } from './shortcuts';
  import { localStore } from './storage';

  /** App shell (SPEC R44): hash-routed views, drop overlay, global keys, theme and language. */
  const editor = new EditorStore({
    store: localStore(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as number),
    defaultLocale: navigator.language.toLowerCase().startsWith('sv') ? 'sv' : 'en',
  });

  let image = $state.raw<{ img: RgbaImage; target: ImportTarget; fileName: string } | null>(null);
  let startState = $state(initialStartState());
  let startView = $state<{ drop: (file: File) => void }>();
  let dragging = $state(false);
  let firstRun = editor.firstRun;

  const router = createRouter({
    getHash: () => location.hash,
    push: (h) => (location.hash = h),
    replace: (h) => location.replace(h),
    back: () => history.back(),
    ctx: () => ({
      hasImage: image !== null,
      hasPattern: editor.analysis.instructions !== undefined,
      firstRun,
    }),
  });
  let route = $state<Route>(router.sync());
  firstRun = false;

  function update(): void {
    route = router.route;
    if (route !== 'import') image = null;
  }

  const nav: ViewNav = {
    go: (r) => (router.go(r), update()),
    leave: (to) => (router.leave(to), update()),
    async openImage(file, target) {
      try {
        const img = await decodeImage(file);
        editor.dismiss('openError');
        image = { img, target, fileName: file.name };
        nav.go('import');
      } catch {
        editor.openFailed('image');
      }
    },
  };

  const viewName = $derived(
    route === 'editor'
      ? editor.pattern.title || editor.t('shell.untitled')
      : editor.t(`shell.view.${route}`),
  );

  $effect(() => editor.autosave(editor.pattern));
  $effect(() => {
    document.documentElement.lang = editor.locale;
  });
  $effect(() => {
    const a = themeAttribute(editor.theme);
    if (a) document.documentElement.dataset.theme = a;
    else delete document.documentElement.dataset.theme;
  });
  $effect(() => {
    document.title = editor.t('shell.documentTitle', { view: viewName });
  });

  let shown: Route = router.route;
  $effect(() => {
    if (route === shown) return;
    shown = route;
    void tick().then(() => document.querySelector<HTMLElement>('[data-view] h1')?.focus());
  });

  function onKey(e: KeyboardEvent): void {
    if (route !== 'editor') return;
    const action = shortcut(e);
    if (!action) return;
    e.preventDefault();
    if (action === 'undo') editor.undo();
    else if (action === 'redo') editor.redo();
    else editor.selectColorIndex(action);
  }

  async function onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (!file || !dropAllowed(route)) return;
    if (route === 'new') startView?.drop(file);
    else if (fileKind(file) === 'image') await nav.openImage(file, { source: 'editor' });
    else editor.open(await file.text());
  }
</script>

<svelte:window
  onkeydown={onKey}
  onhashchange={() => (router.sync(), update())}
  onpagehide={() => editor.flush()}
  ondragover={(e) => (e.preventDefault(), (dragging = dropAllowed(route)))}
  ondragleave={(e) => e.relatedTarget === null && (dragging = false)}
  ondrop={onDrop}
/>
<svelte:document
  onvisibilitychange={() => document.visibilityState === 'hidden' && editor.flush()}
/>

{#if route === 'new'}
  <StartView bind:this={startView} {editor} {nav} bind:start={startState} />
{:else if route === 'import' && image}
  <ImportView {editor} {nav} img={image.img} target={image.target} fileName={image.fileName} />
{:else if route === 'print'}
  <PrintView {editor} {nav} />
{:else}
  <EditorView {editor} {nav} />
{/if}
{#if dragging}<div class="drop">{editor.t('ui.dropHint')}</div>{/if}

<style>
  .drop {
    position: fixed;
    inset: 1rem;
    z-index: 100;
    border: 3px dashed var(--accent);
    border-radius: var(--r-card);
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    font-size: 1.2rem;
    pointer-events: none;
  }
</style>
