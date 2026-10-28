<script lang="ts">
  import Counter from './Counter.svelte';
  import { shared } from './shared.svelte';
</script>

{#each { length: shared.counters }, i (i)}
  <Counter start={i} />
{/each}
