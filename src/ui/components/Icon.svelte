<script lang="ts">
  import { ICONS, type IconName } from '../icons';

  /** 24 px stroke icon (R45); decorative (`aria-hidden`) unless `label` is given. */
  let { name, size = 20, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden={label ? undefined : 'true'}
  role={label ? 'img' : undefined}
  aria-label={label}
  focusable="false"
>
  <path d={ICONS[name]} />
</svg>

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
