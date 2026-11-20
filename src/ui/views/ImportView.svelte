<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import type { RgbaImage } from '../../core';
  import BannerList from '../components/BannerList.svelte';
  import Icon from '../components/Icon.svelte';
  import PictureCard from '../components/import/PictureCard.svelte';
  import PreviewCard from '../components/import/PreviewCard.svelte';
  import StepBackground from '../components/import/StepBackground.svelte';
  import StepColours from '../components/import/StepColours.svelte';
  import StepCrop from '../components/import/StepCrop.svelte';
  import StepDetails from '../components/import/StepDetails.svelte';
  import StepDone from '../components/import/StepDone.svelte';
  import Segmented from '../components/import/Segmented.svelte';
  import Stepper from '../components/import/Stepper.svelte';
  import type { EditorStore } from '../state/editor.svelte';
  import { WIZARD_STEPS, type ImportTarget } from '../state/import-wizard';
  import { DEBOUNCE_MS, IDLE_MS, ImportWizard } from '../state/import-wizard.svelte';
  import type { ViewNav } from '../state/route';

  /**
   * "Mönster från bild" (`#/import`, SPEC R53): five-step wizard with the picture, the bead
   * preview and the step panel; Apply = one undo step, settings saved on Apply only.
   */
  let {
    editor,
    nav,
    img,
    target,
    fileName,
  }: {
    editor: EditorStore;
    nav: ViewNav;
    img: RgbaImage;
    target: ImportTarget;
    fileName: string;
  } = $props();

  // svelte-ignore state_referenced_locally
  const w = new ImportWizard(editor, img, target, fileName);
  const phone = new MediaQuery('(max-width: 599px)', false);
  let pane = $state<'picture' | 'beads'>('beads');
  onDestroy(() => w.highlighter.dispose());

  const index = $derived(WIZARD_STEPS.indexOf(w.steps.step));
  const nextStep = $derived(WIZARD_STEPS[index + 1]);
  const leave = (): void => nav.leave(w.target.source === 'start' ? 'new' : undefined);

  $effect(() => {
    void [w.settings, w.lattice, w.palette, w.crop];
    if (!w.valid) return;
    w.working = true;
    const id = setTimeout(() => w.compute(), DEBOUNCE_MS);
    return () => clearTimeout(id);
  });

  $effect(() => {
    const d = w.result?.a.debug;
    if (!d) return;
    const id = setTimeout(() => void d.thin, IDLE_MS);
    return () => clearTimeout(id);
  });

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    if (w.crop) w.crop = null;
    else leave();
  }

  function apply(): void {
    if (w.apply()) nav.leave();
  }
</script>

<svelte:window
  onkeydown={onKey}
  onpointerup={w.releaseSlider}
  onpointercancel={w.releaseSlider}
  onblur={w.releaseSlider}
/>

<div class="view" data-view="import">
  <header class="top">
    <button type="button" class="btn ghost" onclick={leave}>
      <Icon name="chevron-left" /><span class:sr-only={phone.current}>
        {editor.t(w.target.source === 'start' ? 'ui.back' : 'shell.backToPattern')}
      </span>
    </button>
    <h1 tabindex="-1" class="serif" class:sr-only={phone.current}>
      {editor.t('shell.view.import')}
    </h1>
    <Stepper {w} compact={phone.current} />
  </header>
  {#if phone.current}
    <div class="panes">
      <Segmented
        label={editor.t('wizard.pane.label')}
        options={[
          { value: 'picture', label: editor.t('wizard.pane.picture') },
          { value: 'beads', label: editor.t('wizard.pane.beads') },
        ]}
        value={pane}
        onchange={(v) => (pane = v)}
      />
    </div>
  {/if}
  <main class="work" data-pane={pane}>
    <PictureCard {w} />
    <div class="arrow" aria-hidden="true"><Icon name="chevron" size={28} /></div>
    <PreviewCard {w} />
  </main>
  <aside class="panel">
    <div class="pbody">
      <p class="stepof">
        {editor.t('wizard.stepOf', { n: index + 1, total: WIZARD_STEPS.length })}
      </p>
      {#if w.steps.step === 'crop'}
        <StepCrop {w} />
      {:else if w.steps.step === 'background'}
        <StepBackground {w} />
      {:else if w.steps.step === 'colours'}
        <StepColours {w} />
      {:else if w.steps.step === 'details'}
        <StepDetails {w} />
      {:else}
        <StepDone {w} />
      {/if}
    </div>
    <footer class="pfoot">
      <button type="button" class="btn lg" disabled={index === 0} onclick={() => w.prev()}>
        {editor.t('ui.back')}
      </button>
      {#if nextStep}
        <button type="button" class="btn lg primary grow" onclick={() => w.next()}>
          {editor.t('wizard.next', { step: editor.t(`wizard.step.${nextStep}`) })}
          <Icon name="chevron" />
        </button>
      {:else}
        <button
          type="button"
          class="btn lg primary grow"
          disabled={w.block !== null}
          aria-describedby={w.block ? 'import-block' : undefined}
          onclick={apply}
        >
          {editor.t('wizard.apply')}
          <Icon name="chevron" />
        </button>
      {/if}
    </footer>
  </aside>
  <div class="toasts"><BannerList {editor} /></div>
</div>

<style>
  .view {
    display: grid;
    grid-template: 64px 1fr / 1fr 404px;
    height: 100dvh;
    background: var(--bg);
  }
  .top {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font-size: 17px;
    white-space: nowrap;
  }
  .work {
    padding: 22px 28px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
    min-height: 0;
  }
  .arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .panel {
    background: var(--surface);
    border-left: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .pbody {
    flex: 1;
    padding: 24px 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }
  .stepof {
    margin: 0 0 -12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .pfoot {
    position: sticky;
    bottom: 0;
    padding: 16px 24px;
    border-top: 1px solid var(--line);
    display: flex;
    gap: 10px;
    background: var(--surface);
  }
  .grow {
    flex: 1;
  }
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 20;
  }
  @media (max-width: 1023px) {
    .view {
      display: flex;
      flex-direction: column;
      height: auto;
      min-height: 100dvh;
    }
    .top {
      flex-wrap: wrap;
      row-gap: 0;
      min-height: 64px;
      padding: 8px 16px;
    }
    .top :global(.steps) {
      flex-basis: 100%;
      overflow-x: auto;
    }
    .work {
      padding: 16px;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }
    .work > :global(.pane) {
      max-height: 45vh;
    }
    .arrow {
      display: none;
    }
    .panel {
      border-left: 0;
      border-top: 1px solid var(--line);
      flex: 1;
    }
    .pfoot {
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
  }
  @media (max-width: 599px) {
    .top {
      flex-wrap: nowrap;
      gap: 8px;
      padding: 8px 12px 8px 4px;
    }
    .panes {
      display: flex;
      justify-content: center;
      padding: 12px 12px 0;
    }
    .work {
      padding: 12px;
      grid-template-columns: minmax(0, 1fr);
    }
    .work > :global(.pane) {
      min-height: 40vh;
      max-height: none;
    }
    .work[data-pane='picture'] > :global(.pane:last-child),
    .work[data-pane='beads'] > :global(.pane:first-child) {
      display: none;
    }
    .pbody {
      padding: 16px;
    }
    .pfoot {
      padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    }
  }
</style>
