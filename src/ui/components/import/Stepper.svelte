<script lang="ts">
  import { stepDone, WIZARD_STEPS } from '../../state/import-wizard';
  import type { ImportWizard } from '../../state/import-wizard.svelte';
  import Icon from '../Icon.svelte';

  /**
   * Wizard stepper (SPEC R53): number or check, label; every step reachable. `compact` (phone)
   * shows "Steg 2 av 5 · Bakgrund" with dots; the footer moves between steps.
   */
  let { w, compact = false }: { w: ImportWizard; compact?: boolean } = $props();
  const t = $derived(w.editor.t);
  const used = $derived(w.result?.stats.colors);
  const index = $derived(WIZARD_STEPS.indexOf(w.steps.step));
</script>

{#if compact}
  <nav class="compact" aria-label={t('wizard.steps')}>
    <span aria-current="step">
      {t('wizard.stepOf', { n: index + 1, total: WIZARD_STEPS.length })} · {t(
        `wizard.step.${w.steps.step}`,
      )}
    </span>
    <span class="dots" aria-hidden="true">
      {#each WIZARD_STEPS as step, i (step)}
        <span class:on={i === index} class:done={stepDone(w.steps, step)}></span>
      {/each}
    </span>
  </nav>
{:else}<nav class="steps" aria-label={t('wizard.steps')}>
    <ol>
      {#each WIZARD_STEPS as step, i (step)}
        {#if i > 0}<li class="ln" aria-hidden="true"></li>{/if}
        <li>
          <button
            type="button"
            class="st"
            class:on={w.steps.step === step}
            class:done={stepDone(w.steps, step)}
            aria-current={w.steps.step === step ? 'step' : undefined}
            onclick={() => w.go(step)}
          >
            <span class="no">
              {#if stepDone(w.steps, step)}<Icon name="check" size={15} />{:else}{i + 1}{/if}
            </span>
            {t(`wizard.step.${step}`)}
            {#if step === 'colours' && used !== undefined}
              <small>{t('wizard.step.count', { n: used })}</small>
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  </nav>{/if}

<style>
  .compact {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots span {
    width: 18px;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
  }
  .dots .done {
    background: var(--ok);
  }
  .dots .on {
    background: var(--accent);
  }
  .steps {
    margin: 0 auto;
  }
  ol {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .st {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 6px 12px 6px 6px;
    border: 0;
    border-radius: 99px;
    background: none;
    font: inherit;
    font-weight: 550;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .no {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    font-size: 12px;
    font-weight: 700;
  }
  .done .no {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .on .no {
    background: var(--accent);
    color: var(--accent-ink);
  }
  small {
    font-weight: 450;
    opacity: 0.8;
  }
  .ln {
    width: 22px;
    border-top: 1.5px solid var(--line);
  }
</style>
