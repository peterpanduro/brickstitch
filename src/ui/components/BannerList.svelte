<script lang="ts">
  import type { EditorStore } from '../state/editor.svelte';
  import Icon from './Icon.svelte';

  /** Load/save/open/ring messages as toasts in the canvas toast slot (SPEC R50). */
  let { editor }: { editor: EditorStore } = $props();
  const b = $derived(editor.banners);
</script>

<div class="banners" role="status">
  {#if b.loadError}
    <div class="toast float error">
      <Icon name="alert" />
      <span>{editor.t('banner.loadError', { error: editor.t(b.loadError) })}</span>
      <button type="button" class="btn sm" onclick={() => editor.discardStored()}>
        {editor.t('banner.discard')}
      </button>
    </div>
  {/if}
  {#if b.saveError}
    <div class="toast float error">
      <Icon name="alert" />
      <span>{editor.t('banner.saveError', { error: editor.t(b.saveError) })}</span>
      <button
        type="button"
        class="btn sm icon ghost"
        aria-label={editor.t('banner.dismiss')}
        title={editor.t('banner.dismiss')}
        onclick={() => editor.dismiss('saveError')}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  {/if}
  {#if editor.ringClipped > 0}
    <div class="toast float warn">
      <Icon name="alert" />
      <span>{editor.t('banner.ringClipped', { n: editor.ringClipped })}</span>
      <button
        type="button"
        class="btn sm icon ghost"
        aria-label={editor.t('banner.dismiss')}
        title={editor.t('banner.dismiss')}
        onclick={() => (editor.ringClipped = 0)}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  {/if}
  {#if b.openError}
    <div class="toast float error">
      <Icon name="alert" />
      <span>{editor.t('banner.openError', { error: editor.t(b.openError) })}</span>
      <button
        type="button"
        class="btn sm icon ghost"
        aria-label={editor.t('banner.dismiss')}
        title={editor.t('banner.dismiss')}
        onclick={() => editor.dismiss('openError')}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  {/if}
</div>

<style>
  .banners {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toast {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 8px 8px 12px;
  }
  .toast span {
    flex: 1;
  }
  .error {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .warn {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .toast .btn {
    color: inherit;
  }
</style>
