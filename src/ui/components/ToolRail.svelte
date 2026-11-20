<script lang="ts">
  import type { EditorStore } from '../state/editor.svelte';
  import { railKeyTarget, railTools } from '../state/rail';
  import Icon from './Icon.svelte';

  /** Vertical radiogroup of tools with roving tabindex (SPEC R46; Sudda only on shaped patterns). */
  let { editor }: { editor: EditorStore } = $props();

  const tools = $derived(railTools(editor.pattern.mode));

  function onKey(e: KeyboardEvent): void {
    const next = railKeyTarget(
      tools.map((t) => t.id),
      editor.tool,
      e.key,
    );
    if (next === null) return;
    e.preventDefault();
    editor.setTool(next);
    const i = tools.findIndex((t) => t.id === next);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
  }
</script>

<div
  class="tools"
  role="radiogroup"
  aria-label={editor.t('ui.tools')}
  tabindex="-1"
  onkeydown={onKey}
>
  {#each tools as tool (tool.id)}
    {#if tool.id === 'ring'}<hr />{/if}
    <button
      type="button"
      role="radio"
      data-tool={tool.id}
      aria-checked={editor.tool === tool.id}
      tabindex={editor.tool === tool.id ? 0 : -1}
      onclick={() => editor.setTool(tool.id)}
    >
      <Icon name={tool.icon} size={24} />
      {editor.t(tool.label)}
    </button>
  {/each}
</div>

<style>
  .tools {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  button {
    width: 72px;
    min-height: 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 9px 0 7px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    font-size: 12px;
    font-weight: 550;
    color: var(--muted);
  }
  button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  button[aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }
  hr {
    width: 40px;
    border: 0;
    border-top: 1px solid var(--line);
    margin: 8px auto;
  }
</style>
