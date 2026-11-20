<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  /**
   * Fixed popover left of the right panel, or a bottom sheet (`sheet`, and always under a coarse
   * pointer; R51, R56): focuses its first field (else itself), keeps Tab inside, closes on Escape and on a
   * pointer press outside it, committing pending field changes by blurring first (except on
   * `ignore`, normally the trigger button). `bottom` lifts the sheet above the touch dock.
   */
  let {
    top = 0,
    label,
    width = 420,
    ignore = null,
    sheet = false,
    bottom = 0,
    onClose,
    children,
  }: {
    top?: number;
    label: string;
    width?: number;
    ignore?: HTMLElement | null;
    sheet?: boolean;
    bottom?: number;
    onClose: (refocus: boolean) => void;
    children: Snippet;
  } = $props();

  const coarse = new MediaQuery('(pointer: coarse)', false);
  const asSheet = $derived(sheet || coarse.current);
  let el = $state<HTMLDivElement>();

  $effect(() => {
    (
      el?.querySelector<HTMLElement>('input,select') ??
      el?.querySelector<HTMLElement>('button') ??
      el
    )?.focus();
  });

  function close(refocus: boolean): void {
    if (document.activeElement instanceof HTMLElement && el?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    onClose(refocus);
  }

  function outside(e: PointerEvent): void {
    const t = e.target as Node;
    if (el && !el.contains(t) && !ignore?.contains(t)) close(false);
  }

  const TABBABLE =
    ':is(a[href],button:not(:disabled),input:not(:disabled,[type="hidden"]),' +
    'select:not(:disabled),textarea:not(:disabled),[tabindex]):not([tabindex="-1"])';

  function trap(e: KeyboardEvent): void {
    const all = [...(el?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])].filter(
      (x) => x.getClientRects().length > 0,
    );
    const first = all[0];
    const last = all.at(-1);
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Tab') return trap(e);
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close(true);
  }
</script>

<svelte:window onpointerdown={outside} />

<div
  bind:this={el}
  class="float pop"
  class:sheet={asSheet}
  role="dialog"
  aria-label={label}
  tabindex="-1"
  style:top={asSheet ? undefined : `${top}px`}
  style:width={asSheet ? undefined : `${width}px`}
  style:max-height={asSheet ? `calc(85dvh - ${bottom}px)` : `calc(100dvh - ${top + 16}px)`}
  style:bottom={asSheet ? `${bottom}px` : undefined}
  onkeydown={onKey}
>
  {@render children()}
</div>

<style>
  .pop {
    position: fixed;
    right: calc(var(--side-w) + 16px);
    z-index: 20;
    max-width: calc(100vw - var(--side-w) - 32px);
    padding: 16px;
    overflow: auto;
  }
  .pop.sheet {
    left: 0;
    right: 0;
    max-width: none;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    border-radius: var(--r-float) var(--r-float) 0 0;
  }
</style>
