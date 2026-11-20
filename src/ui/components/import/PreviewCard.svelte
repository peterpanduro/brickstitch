<script lang="ts">
  import { pillText } from '../../state/checklist';
  import { ringOutline } from '../../state/import-merge';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import { REAL_SIZE_BOX } from '../../state/real-size';
  import { fitScale, startRowMm } from '../../state/zoom';
  import { BEAD_TYPES } from '../../../core';
  import Icon from '../Icon.svelte';
  import RealSizePair from '../RealSizePair.svelte';
  import SceneShapes from '../SceneShapes.svelte';
  import SizeBar from './SizeBar.svelte';

  /**
   * "Så blir pärlmönstret" (SPEC R53): checklist pill, bead preview with the replaced-ring
   * outline (R37), inset real-size copy, status texts and the size bar.
   */
  let { w }: { w: ImportWizard } = $props();
  const t = $derived(w.editor.t);
  const status = $derived(w.block && w.block !== 'import.empty' ? t(w.block) : '');
  const err = $derived(w.block === 'import.invalid' || w.block === 'import.failed');
  const pill = $derived(w.pill && pillText(w.pill));
  const PAD = 16;
  const PILL_ROOM = 112;
  const WIDE_VIEW = 400;
  let vw = $state(0);
  let vh = $state(0);
  const startMm = $derived(
    w.result && w.merged && w.mergedAnalysis
      ? startRowMm(
          w.result.scene,
          w.mergedAnalysis.ladderRow,
          BEAD_TYPES[w.merged.beadType].rowPitchMm,
        )
      : null,
  );
  const showPill = $derived(startMm !== null && vw >= WIDE_VIEW);
  const scale = $derived(
    w.result
      ? fitScale(
          { width: vw, height: vh },
          { width: w.result.scene.widthMm, height: w.result.scene.heightMm },
          { top: PAD, right: PAD, bottom: PAD, left: showPill ? PILL_ROOM : PAD },
        )
      : 1,
  );
</script>

<section class="card pane" aria-labelledby="import-preview">
  <div class="row">
    <h2 id="import-preview">{t('wizard.preview')}</h2>
    <span class="sp"></span>
    {#if w.pill && pill && !w.working}
      <span class="pill {w.pill.kind}" role="status">
        <Icon name={w.pill.kind === 'ok' ? 'check' : 'alert'} size={14} />{t(pill.key, pill.params)}
      </span>
    {/if}
  </div>
  <div
    class="view"
    class:pill-room={showPill}
    aria-busy={w.working}
    bind:clientWidth={vw}
    bind:clientHeight={vh}
  >
    {#if w.result}
      <div class="sheet">
        {#if showPill && startMm !== null}
          <div class="start" style:top="{startMm * scale}px" aria-hidden="true">
            <Icon name="start" size={14} />{t('check.startHere')}
          </div>
        {/if}
        <svg
          width={w.result.scene.widthMm * scale}
          height={w.result.scene.heightMm * scale}
          viewBox="0 0 {w.result.scene.widthMm} {w.result.scene.heightMm}"
          class:stale={w.working || !w.valid}
          role="img"
          aria-label={t('wizard.preview')}
          font-family="Helvetica, Arial, sans-serif"
        >
          <SceneShapes scene={w.result.scene} hatchId="bs-hatch-import" />
          <g class="ring-outline" aria-hidden="true">
            {#each ringOutline(w.result.a, w.result.scene.origin) as b, i (i)}
              <rect x={b.xMm} y={b.yMm} width={b.wMm} height={b.hMm} />
            {/each}
          </g>
        </svg>
      </div>
    {/if}
    {#if w.merged && w.mergedAnalysis && !w.empty && vw >= WIDE_VIEW}
      <div class="inset">
        <RealSizePair
          pattern={w.merged}
          analysis={w.mergedAnalysis}
          box={REAL_SIZE_BOX.tablet}
          locale={w.editor.locale}
          {t}
          single
        />
      </div>
    {/if}
    <p class="status" class:err aria-live="polite">
      {status || (w.empty ? t('import.empty') : '')}
    </p>
  </div>
  <SizeBar {w} />
</section>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    padding: 16px;
    gap: 12px;
    min-height: 0;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 15px;
    font-weight: 650;
    letter-spacing: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
  .view {
    flex: 1;
    min-height: 0;
    position: relative;
    border-radius: 10px;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 16px;
  }
  .view.pill-room {
    padding-left: 112px;
  }
  .sheet {
    position: relative;
    flex: none;
  }
  svg {
    display: block;
  }
  svg :global(rect.bs-ladder) {
    fill: var(--ladder);
  }
  svg :global(text.bs-ladder) {
    display: none;
  }
  .start {
    position: absolute;
    right: calc(100% + 14px);
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 99px;
    background: var(--ladder);
    color: var(--ink);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    pointer-events: none;
  }
  .start::after {
    content: '';
    position: absolute;
    right: -14px;
    width: 14px;
    border-top: 2px solid var(--ladder);
  }
  svg.stale {
    opacity: 0.5;
  }
  .ring-outline {
    opacity: 0.55;
    fill: none;
    stroke: var(--accent);
    stroke-width: 0.3;
    stroke-dasharray: 0.4 0.25;
  }
  .inset {
    position: absolute;
    right: 12px;
    bottom: 12px;
    max-width: 60%;
  }
  .inset :global(header) {
    white-space: nowrap;
  }
  .status {
    position: absolute;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .status:not(:empty) {
    padding: 4px 10px;
    border-radius: 99px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .err {
    color: var(--danger);
  }
</style>
