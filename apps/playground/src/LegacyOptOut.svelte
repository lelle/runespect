<svelte:options runes={false} />

<script lang="ts">
  import { writable } from 'svelte/store';

  const total = writable(7);
</script>

<p>{$total}</p>
