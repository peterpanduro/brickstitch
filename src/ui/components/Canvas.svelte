<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { BEAD_TYPES, cellsAlong, hitTest, ringCellsAt, rowNumbers, type Coord } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import { gestureStep, initGesture, type GestureOutput, type PointerKind } from '../state/gesture';
  import { nudgeAnchor, placesOnRelease, ringBeads, sameAnchor } from '../state/ring';
  import { rovingTarget } from '../state/roving';
  import {
    canvasPadding,
    displayScale,
    fitScale,
    SHEET_PAD,
    startRowMm,
    VIEW_PAD,
    wheelZoom,
    withSheet,
    type Insets,
    type SizePx,
  } from '../state/zoom';
  import Icon from './Icon.svelte';
  import SceneShapes from './SceneShapes.svelte';
  import ShapeList from './ShapeList.svelte';

  /**
   * Pattern canvas (SPEC R46): the scene on a paper sheet with glossy beads, the "Börja här"
   * start-row pill, pointer painting, ladder gutter and zoom; runs pending "Visa" requests once
   * mounted. `fit` reports the fit scale (px/mm) for the zoom bar; `toolCard` is the size of the
   * floating tool card, which the sheet and start pill keep clear of; `base` the layout's viewport
   * padding. Pointers go through the R51 gesture recogniser: one touch paints, two pan and zoom
   * (cancelling the stroke; `onPinch` reports it); Ctrl/⌘ + wheel zooms at the cursor.
   */
  let {
    editor,
    fit = $bindable(1),
    toolCard = null,
    base = VIEW_PAD,
    startPill = true,
    onPinch,
  }: {
    editor: EditorStore;
    fit?: number;
    toolCard?: SizePx | null;
    base?: Insets;
    startPill?: boolean;
    onPinch?: () => void;
  } = $props();

  const GLOSS_ID = 'bs-gloss';

  type Pt = { x: number; y: number };

  let svg = $state<SVGSVGElement>();
  let viewport = $state<HTMLDivElement>();
  let focusEl = $state<SVGRectElement>();
  let boxW = $state(0);
  let boxH = $state(0);
  let tabRow = $state<number | null>(null);
  let ghost = $state.raw<Coord | null>(null);

  const scene = $derived(editor.scene);
  const t = $derived(BEAD_TYPES[editor.pattern.beadType]);
  const numbers = $derived(rowNumbers(editor.pattern));
  let liveZoom = $state<number | null>(null);
  const zoom = $derived(liveZoom ?? editor.settings.zoom);
  const realSize = $derived(liveZoom === null && editor.settings.realSize);
  const viewBox = $derived({ width: boxW, height: boxH });
  const sceneMm = $derived({ width: scene.widthMm, height: scene.heightMm });
  const pad = $derived(canvasPadding(viewBox, sceneMm, toolCard, base));
  const fitNow = $derived(fitScale(viewBox, sceneMm, withSheet(pad)));
  $effect(() => {
    fit = fitNow;
  });
  const px = $derived(displayScale({ zoom, realSize }, fitNow));
  const width = $derived(realSize ? `${scene.widthMm}mm` : `${scene.widthMm * px}px`);
  const height = $derived(realSize ? `${scene.heightMm}mm` : `${scene.heightMm * px}px`);
  const ladder = $derived(editor.analysis.ladderRow);
  const focus = $derived(editor.focus);
  const ladderText = $derived(
    scene.overlay.find((s) => s.t === 'text' && s.role === 'rowNumber' && s.r === ladder),
  );
  const startMm = $derived(startRowMm(scene, ladder, t.rowPitchMm));
  const startTop = $derived(startMm === null ? 0 : SHEET_PAD + startMm * px);
  const firstRow = $derived(numbers.findIndex((n) => n !== null));
  const tabbable = $derived(
    tabRow !== null && numbers[tabRow] != null ? tabRow : (ladder ?? firstRow),
  );

  const ringTool = $derived(editor.tool === 'ring');
  const ghostShapes = $derived.by(() => {
    const c = editor.ringCandidate;
    const hex = editor.pattern.palette.find((e) => e.id === editor.color)?.hex;
    if (!ringTool || !ghost || !c || !hex) return [];
    const { cells } = ringCellsAt(editor.pattern, c, ghost);
    return ringBeads(cells, editor.pattern.beadType, hex, scene.origin);
  });

  /** Sets the ghost anchor only when its cell changes. */
  function setGhost(next: Coord | null): void {
    if (!sameAnchor(ghost, next)) ghost = next;
  }

  $effect(() => {
    if (!ringTool) setGhost(null);
  });

  $effect(() => {
    void editor.patternEpoch;
    untrack(() => setGhost(null));
  });

  $effect(() => {
    if (!editor.ringCentred || !editor.ringCandidate) return;
    untrack(() => ghost && setGhost(editor.resnapRing(ghost)));
  });

  let ringPointer: number | null = null;
  let ringOnRelease = false;

  let pointer: number | null = null;
  let last: Pt | null = null;
  let pending: Pt | null = null;
  let frame = 0;

  $effect(() => {
    if (!focus) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    focusEl?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: reduce ? 'auto' : 'smooth',
    });
  });

  $effect(() => {
    if (editor.showWarningPending && boxW > 0 && boxH > 0)
      untrack(() => editor.consumeShowWarning());
  });

  function localMm(e: PointerEvent): Pt | null {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x - scene.origin.x, y: pt.y - scene.origin.y };
  }

  function flushMove(): void {
    frame = 0;
    if (!pending || !editor.stroking) return;
    editor.move(cellsAlong(editor.pattern, last ?? pending, pending));
    last = pending;
    pending = null;
  }

  function ringAt(e: PointerEvent): Coord | null {
    const pt = localMm(e);
    return pt && editor.ringAnchor(pt.x, pt.y);
  }

  let gesture = initGesture();
  let pinchAnchor: DOMPoint | null = null;
  let pinchFrame = 0;
  let pinchNext: { scale: number; mid: Pt } | null = null;

  const kindOf = (e: PointerEvent): PointerKind =>
    e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';

  function svgPoint(x: number, y: number): DOMPoint | null {
    const m = svg?.getScreenCTM();
    return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : null;
  }

  /**
   * Zooms to `scale` px/mm keeping the scene point `anchor` under client point `at`; the zoom
   * stays local until {@link commitZoom} saves it once.
   */
  async function zoomAt(scale: number, anchor: DOMPoint | null, at: Pt): Promise<void> {
    liveZoom = scale;
    await tick();
    const m = svg?.getScreenCTM();
    if (!anchor || !m || !viewport) return;
    const p = anchor.matrixTransform(m);
    viewport.scrollLeft += p.x - at.x;
    viewport.scrollTop += p.y - at.y;
  }

  function flushPinch(): void {
    pinchFrame = 0;
    if (pinchNext) void zoomAt(pinchNext.scale, pinchAnchor, pinchNext.mid);
    pinchNext = null;
  }

  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  function commitZoom(): void {
    clearTimeout(wheelTimer);
    if (pinchFrame) cancelAnimationFrame(pinchFrame);
    flushPinch();
    if (liveZoom !== null) editor.setView(liveZoom, false);
    liveZoom = null;
  }

  onDestroy(() => {
    commitZoom();
    if (pointer !== null) editor.cancelStroke();
  });

  const inScene = (e: Event): boolean => !!svg && svg.contains(e.target as Node);

  function toolDown(e: PointerEvent): void {
    if (!inScene(e)) return;
    if (ringTool) {
      const a = ringPointer === null ? ringAt(e) : null;
      if (!a) return;
      setGhost(a);
      ringPointer = e.pointerId;
      ringOnRelease = placesOnRelease(e.pointerType);
      viewport?.setPointerCapture(e.pointerId);
      if (!ringOnRelease) editor.placeRing(a);
      return;
    }
    const pt = localMm(e);
    const c = pt ? hitTest(editor.pattern, pt.x, pt.y) : null;
    if (!c) return;
    pointer = e.pointerId;
    viewport?.setPointerCapture(e.pointerId);
    last = pt;
    editor.down(c);
  }

  function toolEnd(e: PointerEvent, released: boolean): void {
    if (e.pointerId === ringPointer) {
      ringPointer = null;
      if (ringOnRelease && released && ghost) editor.placeRing(ghost);
      return;
    }
    if (e.pointerId !== pointer) return;
    if (frame) cancelAnimationFrame(frame);
    flushMove();
    pointer = null;
    last = null;
    editor.up();
  }

  function toolCancel(): void {
    if (ringPointer !== null) {
      ringPointer = null;
      setGhost(null);
    }
    if (pointer === null) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    pointer = null;
    last = null;
    editor.cancelStroke();
  }

  function apply(o: GestureOutput, e: PointerEvent): void {
    if (o.kind === 'down') toolDown(e);
    else if (o.kind === 'move') {
      if (e.pointerId === ringPointer) setGhost(ringAt(e) ?? ghost);
      if (e.pointerId !== pointer || !editor.stroking) return;
      pending = localMm(e);
      if (!frame) frame = requestAnimationFrame(flushMove);
    } else if (o.kind === 'end') toolEnd(e, o.released);
    else if (o.kind === 'cancel') toolCancel();
    else if (o.kind === 'pinchStart') {
      pinchAnchor = svgPoint(o.mid.x, o.mid.y);
      onPinch?.();
    } else if (o.kind === 'pinch') {
      pinchNext = { scale: o.scale, mid: o.mid };
      if (!pinchFrame) pinchFrame = requestAnimationFrame(flushPinch);
    } else if (o.kind === 'pinchEnd') commitZoom();
  }

  function feed(e: PointerEvent, type: 'down' | 'move' | 'up' | 'cancel'): void {
    if (type === 'down' && e.button !== 0) return;
    const input = { type, id: e.pointerId, kind: kindOf(e), x: e.clientX, y: e.clientY };
    const r = gestureStep(gesture, input, px);
    gesture = r.state;
    if (type === 'down' && kindOf(e) === 'touch') viewport?.setPointerCapture(e.pointerId);
    for (const o of r.out) apply(o, e);
  }

  function onMove(e: PointerEvent): void {
    const idle = ringPointer === null && gesture.tool === null && !gesture.pinch;
    if (ringTool && idle && e.isPrimary && inScene(e)) setGhost(ringAt(e) ?? ghost);
    feed(e, 'move');
  }

  $effect(() => {
    const el = viewport;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const v = wheelZoom({ zoom, realSize }, fitNow, e.deltaY);
      void zoomAt(v.zoom as number, svgPoint(e.clientX, e.clientY), {
        x: e.clientX,
        y: e.clientY,
      });
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(commitZoom, 300);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  /** Keyboard placement for the ring tool: arrows move the ghost, Enter places it. */
  function onKey(e: KeyboardEvent): void {
    if (!ringTool || e.target !== svg) return;
    const start =
      ghost ??
      editor.ringAnchor(
        (editor.pattern.width * t.widthMm) / 2,
        (editor.pattern.height * t.rowPitchMm) / 2,
      );
    if (!start) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setGhost(start);
      editor.placeRing(start);
      return;
    }
    const next = nudgeAnchor(start, e.key, editor.ringCentred);
    if (!next) return;
    e.preventDefault();
    setGhost(next);
  }

  function onKeyRow(e: KeyboardEvent, r: number): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      editor.setLadder(r);
      return;
    }
    const next = rovingTarget(numbers, r, e.key);
    if (next === null) return;
    e.preventDefault();
    tabRow = next;
    svg?.querySelector<SVGElement>(`[data-row="${next}"]`)?.focus();
  }
</script>

<section class="canvas-wrap" aria-label={editor.t('ui.canvas')}>
  <div
    bind:this={viewport}
    class="viewport"
    role="presentation"
    onpointerdown={(e) => feed(e, 'down')}
    onpointermove={onMove}
    onpointerup={(e) => feed(e, 'up')}
    onpointercancel={(e) => feed(e, 'cancel')}
    onlostpointercapture={(e) => feed(e, 'cancel')}
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
    style:padding="{pad.top}px {pad.right}px {pad.bottom}px {pad.left}px"
  >
    <div class="sheet" style:padding="{SHEET_PAD}px">
      {#if ladder !== null && startPill}
        <div class="start" style:top="{startTop}px" aria-hidden="true">
          <Icon name="start" size={14} />{editor.t('check.startHere')}
        </div>
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role=application: keyboard ring placement) -->
      <svg
        bind:this={svg}
        viewBox="0 0 {scene.widthMm} {scene.heightMm}"
        style:width
        style:height
        role="application"
        aria-label={editor.t('ui.canvas')}
        aria-describedby={ringTool ? 'ring-hint' : undefined}
        class="tool-{editor.tool}"
        tabindex={ringTool ? 0 : undefined}
        onkeydown={onKey}
        onpointerleave={() => pointer === null && ringPointer === null && setGhost(null)}
        font-family="Helvetica, Arial, sans-serif"
      >
        <SceneShapes {scene} glossId={GLOSS_ID} />
        <g class="ui-layer">
          {#if ladderText?.t === 'text'}
            <g class="ladder-num" aria-hidden="true">
              <rect
                x="0"
                y={scene.origin.y + (ladderText.r ?? 0) * t.rowPitchMm}
                width={scene.gutterLeftMm}
                height={t.rowPitchMm}
              />
              <text
                x={ladderText.x}
                y={ladderText.y}
                font-size={ladderText.size}
                text-anchor={ladderText.anchor}
              >
                {ladderText.text}
              </text>
            </g>
          {/if}
          {#each numbers as n, r (r)}
            {#if n !== null}
              <rect
                class="gutter"
                class:active={r === ladder}
                data-row={r}
                x="0"
                y={scene.origin.y + r * t.rowPitchMm}
                width={scene.gutterLeftMm}
                height={t.rowPitchMm}
                role="button"
                tabindex={r === tabbable ? 0 : -1}
                aria-label={editor.t(r === ladder ? 'check.ladder.rowButton' : 'ui.setLadder', {
                  n,
                })}
                onpointerdown={(e) => e.stopPropagation()}
                onclick={() => ((tabRow = r), editor.setLadder(r))}
                onfocus={() => (tabRow = r)}
                onkeydown={(e) => onKeyRow(e, r)}
              />
            {/if}
          {/each}
          {#if ghostShapes.length > 0}
            <g class="ghost" aria-hidden="true">
              <ShapeList shapes={ghostShapes} hatchId="bs-hatch" glossId={GLOSS_ID} />
            </g>
          {/if}
          {#if focus}
            <rect
              bind:this={focusEl}
              class="focus"
              x={focus.h === null ? scene.origin.x : scene.origin.x + (focus.h * t.widthMm) / 2}
              y={scene.origin.y + focus.r * t.rowPitchMm}
              width={focus.h === null ? editor.pattern.width * t.widthMm : t.widthMm}
              height={t.rowPitchMm}
            />
          {/if}
        </g>
      </svg>
    </div>
  </div>
</section>

<style>
  .canvas-wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    flex: 1;
  }
  .viewport {
    flex: 1;
    display: flex;
    overflow: auto;
    min-height: 0;
    touch-action: none;
  }
  .sheet {
    position: relative;
    margin: auto;
    flex: none;
    background: var(--paper);
    border-radius: 16px;
    box-shadow: var(--shadow);
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
  svg {
    display: block;
    touch-action: none;
    user-select: none;
  }
  svg :global(rect.bs-ladder) {
    fill: var(--ladder);
  }
  svg :global(text.bs-ladder) {
    display: none;
  }
  svg :global(.bs-text) {
    fill: var(--muted);
  }
  svg :global(.bs-slot) {
    stroke: color-mix(in srgb, var(--line-strong) 40%, var(--paper));
  }
  svg :global(.bs-loop) {
    stroke: var(--muted);
  }
  svg :global(polyline.bs-marker),
  svg :global(line.bs-marker) {
    stroke: var(--muted);
  }
  svg :global(text.bs-marker) {
    fill: var(--muted);
  }
  .ladder-num {
    pointer-events: none;
  }
  .ladder-num rect {
    fill: var(--ladder);
  }
  .ladder-num text {
    fill: var(--ink);
    font-weight: 700;
  }
  .tool-paint,
  .tool-erase,
  .tool-fill,
  .tool-eyedropper,
  .tool-ring {
    cursor: crosshair;
  }
  .gutter {
    fill: transparent;
    cursor: pointer;
  }
  .gutter:hover {
    fill: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .gutter:focus-visible {
    fill: color-mix(in srgb, var(--accent) 14%, transparent);
    stroke: var(--accent);
    stroke-width: 0.25;
    outline: none;
  }
  svg:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .ghost {
    opacity: 0.55;
    pointer-events: none;
  }
  .focus {
    fill: none;
    stroke: var(--accent);
    stroke-width: 0.25;
    pointer-events: none;
  }
</style>
