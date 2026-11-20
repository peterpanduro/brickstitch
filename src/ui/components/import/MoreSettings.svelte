<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Translate } from '../../../core';
  import Icon from '../Icon.svelte';

  /** Collapsed "Fler inställningar · behövs sällan" section of a wizard step (SPEC R53). */
  let { t, children }: { t: Translate; children: Snippet } = $props();
</script>

<details>
  <summary>
    <span class="chev"><Icon name="chevron" size={16} /></span>
    <span class="b">{t('wizard.more')}</span>
    <span class="muted sm">{t('wizard.moreHint')}</span>
  </summary>
  <div class="body">{@render children()}</div>
</details>

<style>
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .chev {
    display: inline-flex;
    transition: transform 0.15s;
  }
  details[open] .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .b {
    font-weight: 600;
  }
  .sm {
    font-size: 12px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0 8px 24px;
  }
  .body :global(label) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .body :global(select) {
    min-width: 10rem;
  }
</style>
