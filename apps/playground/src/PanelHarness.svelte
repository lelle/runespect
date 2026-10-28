<script lang="ts">
  import Counter from './Counter.svelte';
  import Showcase from './Showcase.svelte';

  // The app half of /panel.html. Default: the same showcase the overlay e2e drives, so the panel
  // sees a realistic mixed tree. `rows` instead mounts N Counters — a big real tree (not a
  // synthetic node list) for the virtualization tests.
  let { rows = 0 }: { rows?: number } = $props();
</script>

{#if rows}
  {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
    <Counter start={i} />
  {/each}
{:else}
  <Showcase />
{/if}
