<script lang="ts">
  /** Decorative brick-stitch logo (R45): two offset rows of three beads, two of them red. */
</script>

<span class="logo" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b><b></b></span>

<style>
  .logo {
    --bead-red: #d41f1c;
    display: grid;
    grid-template-columns: repeat(3, 9px);
    gap: 2px;
  }
  b {
    height: 7px;
    border-radius: 2px;
    background: var(--accent);
  }
  b:nth-child(n + 4) {
    transform: translateX(5.5px);
  }
  b:nth-child(2),
  b:nth-child(6) {
    background: var(--bead-red);
  }
</style>
