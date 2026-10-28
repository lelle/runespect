<script lang="ts">
  let { start = 0 }: { start?: number } = $props();
  // svelte-ignore state_referenced_locally
  let count = $state<number>(start);
  let doubled = $derived(count * 2);
  $effect(() => {
    void doubled;
  });
</script>

<button onclick={() => count++}>{count} / {doubled}</button>
