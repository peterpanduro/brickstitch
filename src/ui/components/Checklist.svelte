<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { EditorStore } from '../state/editor.svelte';
  import {
    checklistPill,
    fixAnnouncement,
    pillText,
    type ChecklistAction,
    type ChecklistItem,
    type Text,
  } from '../state/checklist';
  import Icon from './Icon.svelte';

  /**
   * "Går det att sy?" card (SPEC R48): header pill, amber issue cards and checked pass lines.
   * `onAction` runs after a button (the touch sheet closes for "Visa" and the start row, R51).
   */
  let {
    editor,
    onAction,
  }: { editor: EditorStore; onAction?: (kind: ChecklistAction['kind']) => void } = $props();

  const items = $derived(editor.checklist);
  const pill = $derived(checklistPill(items));
  let announcement = $state('');
  let hint = $state(false);

  const tx = (x: Text): string => editor.t(x.key, x.params);

  $effect(() => {
    void editor.pattern.ladder;
    untrack(() => (hint = false));
  });

  function focusLadder(): void {
    const r = editor.analysis.ladderRow;
    const el = document.querySelector<SVGElement>(`.canvas-wrap [data-row="${r}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    el.focus();
    hint = true;
    el.addEventListener('blur', () => (hint = false), { once: true });
  }

  async function announce(text: string): Promise<void> {
    announcement = '';
    await tick();
    announcement = text;
  }

  function run(action: ChecklistAction): void {
    const before: readonly ChecklistItem[] = items;
    if (action.kind === 'show') editor.requestShowWarning(action.code);
    else if (action.kind === 'focusLadder') focusLadder();
    else if (action.kind === 'autoLadder') editor.autoLadder();
    else editor.removeUnsupported();
    const a = fixAnnouncement(action, before, editor.checklist);
    if (a) void announce(tx(a));
    onAction?.(action.kind);
  }
</script>

<section class="chk card" aria-labelledby="check-title">
  <header>
    <h2 id="check-title">{editor.t('check.heading')}</h2>
    {#if pill}
      <span class="pill {pill.kind}">{tx(pillText(pill))}</span>
    {/if}
  </header>
  {#each items as it (it.id)}
    {#if it.kind === 'issue'}
      <div class="issue" data-check={it.id}>
        <span class="warn-icon"><Icon name="alert" /></span>
        <div class="grow">
          <div class="b">{tx(it.title)}</div>
          {#if it.detail}<div class="detail">{tx(it.detail)}</div>{/if}
          <div class="buttons">
            {#each it.buttons as b (b.action.kind)}
              <button type="button" class="btn" onclick={() => run(b.action)}>
                {tx(b.label)}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <div class="okl" data-check={it.id}>
        {#if it.id !== 'empty'}<span class="ok-icon"><Icon name="check" size={16} /></span>{/if}
        <span class="grow">{tx(it.title)}</span>
        {#each it.buttons as b (b.action.kind)}
          <button
            type="button"
            class="link"
            title={b.action.kind === 'focusLadder' && it.hint ? tx(it.hint) : undefined}
            onclick={() => run(b.action)}
          >
            {tx(b.label)}
          </button>
        {/each}
      </div>
      {#if it.id === 'ladder' && hint && it.hint}
        <p class="hint">{tx(it.hint)}</p>
      {/if}
    {/if}
  {/each}
  <p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
  .chk {
    margin: 0 16px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.02em;
  }
  .issue {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: var(--r-control);
    background: var(--warn-soft);
  }
  .warn-icon {
    color: var(--warn);
    margin-top: 1px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .b {
    font-weight: 600;
  }
  .detail {
    font-size: 12px;
    margin: 2px 0 8px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .buttons .btn {
    font-size: 13px;
  }
  .okl {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
  }
  .ok-icon {
    display: inline-flex;
    color: var(--ok);
  }
  .link {
    min-height: 24px;
    padding: 0 2px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
  }
  .link:hover:not(:disabled) {
    color: var(--ink);
    background: none;
  }
  .hint {
    margin: -4px 0 0 24px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
