<script lang="ts">
  import { onMount } from 'svelte';

  let { register }: { register: (bump: () => void) => void } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
  onMount(() => register(() => count++));
</script>

<span>{doubled}</span>
