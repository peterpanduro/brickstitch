<script lang="ts">
  /** Heading and lead text of a wizard step (SPEC R53). */
  let { title, lead }: { title: string; lead: string } = $props();
</script>

<div>
  <h2 class="serif">{title}</h2>
  <p class="muted">{lead}</p>
</div>

<style>
  h2 {
    margin: 4px 0 6px;
    font-size: 24px;
    line-height: 1.15;
  }
  p {
    margin: 0;
  }
</style>
