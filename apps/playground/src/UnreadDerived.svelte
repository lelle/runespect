<script lang="ts">
  let { onEvaluate }: { onEvaluate: () => void } = $props();
  let count = $state(0);
  // Read by nothing in the app: Svelte never evaluates it unless someone else does.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- unread on purpose
  let doubled = $derived((onEvaluate(), count * 2));
</script>

<button onclick={() => count++}>count {count}</button>
