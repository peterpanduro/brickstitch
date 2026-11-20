<svelte:options namespace="svg" />

<script lang="ts">
  import { HATCH_LINE, type Scene } from '../../core';
  import ShapeList from './ShapeList.svelte';

  /**
   * Renders a scene in layers; rows are keyed so unchanged rows are skipped. `glossId` adds the
   * shared bead gloss gradient (editor only, SPEC R45).
   */
  let {
    scene,
    hatchId = 'bs-hatch',
    bare = false,
    glossId,
  }: { scene: Scene; hatchId?: string; bare?: boolean; glossId?: string } = $props();
</script>

<defs>
  <pattern
    id={hatchId}
    width="0.5"
    height="0.5"
    patternUnits="userSpaceOnUse"
    patternTransform="rotate(45)"
  >
    <line {...HATCH_LINE.attrs} />
  </pattern>
  {#if glossId}
    <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
      <stop offset="1" stop-color="#000" stop-opacity="0.15" />
    </linearGradient>
  {/if}
</defs>
<g class="background"><ShapeList shapes={scene.background} {hatchId} {bare} /></g>
<g class="rows">
  {#each scene.rows as row (row.r)}
    <ShapeList shapes={row.shapes} {hatchId} {bare} {glossId} />
  {/each}
</g>
<g class="overlay"><ShapeList shapes={scene.overlay} {hatchId} {bare} /></g>
