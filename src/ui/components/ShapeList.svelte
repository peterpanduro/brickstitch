<svelte:options namespace="svg" />

<script lang="ts">
  import { shapeElements, type Shape } from '../../core';

  /**
   * Renders shapes through the shared `shapeElements` helper (same attributes as `sceneToSvg`);
   * `bare` drops the `data-*` hooks (decorative copies such as the real-size pair); `glossId`
   * draws glossy editor beads with that gradient.
   */
  let {
    shapes,
    hatchId,
    bare = false,
    glossId,
  }: { shapes: readonly Shape[]; hatchId: string; bare?: boolean; glossId?: string } = $props();

  const attrs = (a: Record<string, string | number>): Record<string, string | number> =>
    bare ? Object.fromEntries(Object.entries(a).filter(([k]) => !k.startsWith('data-'))) : a;
</script>

{#each shapes as s, k (k)}
  {#each shapeElements(s, hatchId, glossId) as e, j (j)}
    {#if e.text === undefined}
      <svelte:element this={e.tag} {...attrs(e.attrs)} />
    {:else}
      <svelte:element this={e.tag} {...attrs(e.attrs)}>{e.text}</svelte:element>
    {/if}
  {/each}
{/each}
