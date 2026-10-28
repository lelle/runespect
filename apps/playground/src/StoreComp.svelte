<script lang="ts">
  import { writable } from 'svelte/store';
  const n = writable(5);
</script>

<button onclick={() => ($n += 1)}>{$n}</button>
