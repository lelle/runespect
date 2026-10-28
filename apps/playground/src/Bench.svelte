<script lang="ts">
  import BenchCell from './BenchCell.svelte';

  let { n, register }: { n: number; register: (bump: () => void) => void } = $props();
</script>

{#each { length: n }, i (i)}
  <BenchCell {register} />
{/each}
