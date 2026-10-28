<script lang="ts">
  let { start = 0 }: { start?: number } = $props();
  // svelte-ignore state_referenced_locally
  let count = $state(start);
  let doubled = $derived(count * 2);
</script>

<button onclick={() => (count += 1)}>{count} / {doubled}</button>
