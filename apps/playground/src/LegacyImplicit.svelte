<script lang="ts">
  import { writable } from 'svelte/store';

  let n = 0;
  const total = writable(5);
</script>

<button on:click={() => n++}>{n} {$total}</button>
