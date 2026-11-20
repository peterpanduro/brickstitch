<script lang="ts">
  import type { AnalysisDebug, DebugLayer, DebugTransform, RgbaImage, Rotation } from '../../core';
  import type { EditorStore } from '../state/editor.svelte';
  import {
    cropHandle,
    displayScale,
    dragRect,
    hitTolerance,
    newRect,
    nudgeMode,
    nudgeRect,
    orientedRectToSource,
    orientedSize,
    sourceRectToOriented,
    type CropHandle,
    type CropRect,
  } from '../state/crop';
  import type { ActiveSlider } from '../state/highlight';
  import {
    ADDED_TINT,
    BACKGROUND_TINT,
    CHECKER,
    DETAILS_TINT,
    THIN_TINT,
    labelPixels,
    layerPixels,
    layerToDisplay,
    type Rgba,
  } from '../state/overlay';

  /**
   * Oriented image view with a crop selection (SPEC R38); `crop` is in source image px.
   * `processed` replaces the picture with the analysed image of the current crop and orientation,
   * with an optional slider highlight (R39); `null` shows the original. The view fills its
   * container, aspect kept; `legend` is a chip over the picture (R53).
   */
  let {
    img,
    rotation,
    flipH,
    crop = $bindable(),
    processed = null,
    legend = null,
    t,
  }: {
    img: RgbaImage;
    rotation: Rotation;
    flipH: boolean;
    crop: CropRect | null;
    processed?: { debug: AnalysisDebug; highlight: ActiveSlider | null } | null;
    legend?: string | null;
    t: EditorStore['t'];
  } = $props();

  const uid = $props.id();
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const HANDLE_DRAW_PX = coarse ? 16 : 10;
  const DRAG_START_PX = 3;
  const CURSORS: Record<CropHandle, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    move: 'move',
    new: 'crosshair',
  };

  let canvas = $state<HTMLCanvasElement>();
  let layerCanvas = $state<HTMLCanvasElement>();
  let clientWidth = $state(1);
  let draft = $state<CropRect | null>(null);
  let cursor = $state('crosshair');
  let drag: { handle: CropHandle; x: number; y: number; rect: CropRect | null } | null = null;

  const o = $derived({ imgW: img.width, imgH: img.height, rotation, flipH });
  const size = $derived(orientedSize(img.width, img.height, rotation));
  const scale = $derived(size.width / Math.max(1, clientWidth));
  const shown = $derived(draft ?? (crop ? sourceRectToOriented(crop, o) : null));
  const full = (r: CropRect): boolean =>
    r.x === 0 && r.y === 0 && r.width === size.width && r.height === size.height;
  const commit = (r: CropRect | null): void => {
    crop = r && !full(r) ? orientedRectToSource(r, o) : null;
  };

  const sizeText = $derived(crop ? t('import.cropSize', { w: crop.width, h: crop.height }) : '');

  const bitmap = $derived.by(() => {
    const k = Math.min(1, displayScale(img.width, img.height));
    const data = new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height);
    return createImageBitmap(data, {
      resizeWidth: Math.max(1, Math.round(img.width * k)),
      resizeHeight: Math.max(1, Math.round(img.height * k)),
      resizeQuality: 'high',
    });
  });

  $effect(() => {
    const c = canvas;
    const k = displayScale(img.width, img.height);
    const { width, height } = size;
    const turn = (rotation * Math.PI) / 180;
    const sx = flipH ? -1 : 1;
    let live = true;
    void bitmap.then((bmp) => {
      const ctx = c?.getContext('2d');
      if (!live || !c || !ctx) return;
      c.width = Math.max(1, Math.round(width * k));
      c.height = Math.max(1, Math.round(height * k));
      ctx.imageSmoothingEnabled = k < 1;
      ctx.setTransform(1, 0, 0, 1, c.width / 2, c.height / 2);
      ctx.rotate(turn);
      ctx.scale(sx, 1);
      ctx.drawImage(
        bmp,
        (-img.width * k) / 2,
        (-img.height * k) / 2,
        img.width * k,
        img.height * k,
      );
    });
    return () => {
      live = false;
    };
  });

  /** RGBA pixels on an offscreen canvas, with the layer transform. */
  function offscreen(px: { data: Uint8ClampedArray; w: number; h: number }, t: DebugTransform) {
    if (px.w === 0 || px.h === 0) return null;
    const c = document.createElement('canvas');
    c.width = px.w;
    c.height = px.h;
    c.getContext('2d')?.putImageData(
      new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.w, px.h),
      0,
      0,
    );
    return { c, t };
  }

  const debug = $derived(processed?.debug);
  const labels = $derived(
    debug && offscreen(labelPixels(debug.labels, debug.palette), debug.labels.transform),
  );
  const highlight = $derived.by(() => {
    const h = processed?.highlight;
    if (!debug || !h) return null;
    const tinted = (layers: { layer: DebugLayer; rgba: Rgba }[]) =>
      offscreen(layerPixels(layers), layers[0]!.layer.transform);
    if (h === 'details') return tinted([{ layer: debug.details, rgba: DETAILS_TINT }]);
    return h === 'edge'
      ? tinted([{ layer: debug.backgroundMask, rgba: BACKGROUND_TINT }])
      : tinted([
          { layer: debug.added, rgba: ADDED_TINT },
          { layer: debug.thin, rgba: THIN_TINT },
        ]);
  });

  $effect(() => {
    const c = layerCanvas;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const k = displayScale(img.width, img.height);
    c.width = Math.max(1, Math.round(size.width * k));
    c.height = Math.max(1, Math.round(size.height * k));
    if (!debug) return;
    const tile = checkerTile(
      Math.max(1, Math.round((CHECKER.cssPx * c.width) / Math.max(1, clientWidth))),
    );
    const fill = tile && ctx.createPattern(tile, 'repeat');
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    for (const l of [labels, highlight]) {
      if (!l) continue;
      const m = layerToDisplay(l.t, crop, o);
      ctx.imageSmoothingEnabled = m.sx * k < 1;
      ctx.drawImage(l.c, m.x0 * k, m.y0 * k, l.c.width * m.sx * k, l.c.height * m.sy * k);
    }
  });

  /** Two-grey checkerboard tile with squares of `s` canvas px. */
  function checkerTile(s: number): HTMLCanvasElement | null {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 2 * s;
    const t = tile.getContext('2d');
    if (!t) return null;
    t.fillStyle = CHECKER.colours[0];
    t.fillRect(0, 0, 2 * s, 2 * s);
    t.fillStyle = CHECKER.colours[1];
    t.fillRect(0, 0, s, s);
    t.fillRect(s, s, s, s);
    return tile;
  }

  $effect(() => {
    const b = bitmap;
    return () => void b.then((bmp) => bmp.close());
  });

  function point(e: PointerEvent): { x: number; y: number } {
    const b = (e.currentTarget as Element).getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * size.width,
      y: ((e.clientY - b.top) / b.height) * size.height,
    };
  }

  const handleAt = (x: number, y: number, pointerType: string): CropHandle =>
    shown ? cropHandle(shown, x, y, hitTolerance(pointerType) * scale) : 'new';

  function down(e: PointerEvent): void {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    const p = point(e);
    drag = { handle: handleAt(p.x, p.y, e.pointerType), ...p, rect: shown };
  }

  function move(e: PointerEvent): void {
    if (!e.isPrimary) return;
    const p = point(e);
    if (!drag) {
      cursor = CURSORS[handleAt(p.x, p.y, e.pointerType)];
      return;
    }
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (drag.handle === 'new' || !drag.rect) {
      if (!draft && Math.hypot(dx, dy) < DRAG_START_PX * scale) return;
      draft = newRect(drag.x, drag.y, p.x, p.y, size.width, size.height);
    } else draft = dragRect(drag.handle, drag.rect, dx, dy, size.width, size.height);
  }

  function up(e: PointerEvent): void {
    if (!e.isPrimary || !drag) return;
    if (draft) commit(draft);
    drag = null;
    draft = null;
  }

  function cancel(): void {
    drag = null;
    draft = null;
  }

  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (!crop && !draft) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
      crop = null;
      return;
    }
    const r = nudgeRect(shown, e.key, nudgeMode(e), size.width, size.height);
    if (!r) return;
    e.preventDefault();
    commit(r);
  }
</script>

<div class="crop">
  <div class="view" bind:clientWidth style:--aspect={size.width / Math.max(1, size.height)}>
    <canvas
      bind:this={canvas}
      style:background="repeating-conic-gradient({CHECKER.colours[0]} 0 25%, {CHECKER.colours[1]} 0 50%)
      0 0 / {2 * CHECKER.cssPx}px {2 * CHECKER.cssPx}px"
    ></canvas>
    <canvas class="layer" bind:this={layerCanvas} aria-hidden="true"></canvas>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role=application: pointer and arrow-key selection) -->
    <svg
      viewBox="0 0 {size.width} {size.height}"
      preserveAspectRatio="none"
      role="application"
      aria-label={t('import.crop')}
      aria-describedby="{uid}-hint"
      tabindex="0"
      style:cursor
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={cancel}
      onkeydown={key}
    >
      {#if shown}
        {@const s = HANDLE_DRAW_PX * scale}
        <path
          class="shade"
          fill-rule="evenodd"
          d="M0 0H{size.width}V{size.height}H0Z M{shown.x} {shown.y}h{shown.width}v{shown.height}h{-shown.width}Z"
        />
        <rect class="sel" x={shown.x} y={shown.y} width={shown.width} height={shown.height} />
        {#each [0, 0.5, 1] as fx (fx)}
          {#each [0, 0.5, 1] as fy (fy)}
            {#if fx !== 0.5 || fy !== 0.5}
              <rect
                class="handle"
                x={shown.x + fx * shown.width - s / 2}
                y={shown.y + fy * shown.height - s / 2}
                width={s}
                height={s}
              />
            {/if}
          {/each}
        {/each}
      {/if}
    </svg>
    {#if legend}
      <div class="legend {processed?.highlight ?? ''}">
        <span class="key" aria-hidden="true"></span>{legend}
      </div>
    {/if}
  </div>
  <p id="{uid}-hint" class="sr-only">{t('import.cropHint')} {t('import.cropKeys')}</p>
  <p class="sr-only" aria-live="polite">{sizeText}</p>
  <p class="sr-only" aria-live="polite">{legend ?? ''}</p>
</div>

<style>
  .crop {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }
  .view {
    position: relative;
    line-height: 0;
    width: min(100cqw, 100cqh * var(--aspect));
    border-radius: 10px;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .legend {
    position: absolute;
    left: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 8px;
    background: rgb(255 253 249 / 0.94);
    color: #26221d;
    pointer-events: none;
  }
  .key {
    width: 18px;
    height: 14px;
    border-radius: 3px;
    background: linear-gradient(90deg, rgb(249 115 22) 50%, rgb(14 165 233) 50%);
  }
  .edge .key {
    background: repeating-linear-gradient(45deg, #e0409a 0 3px, #f7b6d9 3px 6px);
  }
  .details .key {
    background: rgb(22 163 74);
  }
  canvas.layer {
    position: absolute;
    inset: 0;
    height: 100%;
    background: none;
    pointer-events: none;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    border-radius: 6px;
    overflow: hidden;
  }
  svg:focus-visible {
    outline: 2px solid var(--accent, #2563eb);
    outline-offset: 2px;
  }
  .shade {
    fill: rgb(0 0 0 / 0.5);
  }
  .sel {
    fill: none;
    stroke: #fff;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 1px #000);
  }
  .handle {
    fill: #fff;
    stroke: #000;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
</style>
