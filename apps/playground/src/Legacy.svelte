<script lang="ts">
  import { writable } from 'svelte/store';

  export let label: string = 'legacy';
  let count = 0;
  const total = writable(10);
  $: doubled = count * 2;
</script>

<button on:click={() => count++}>{label}: {count} {doubled} {$total}</button>
