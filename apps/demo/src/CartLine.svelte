<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Line } from './cart.svelte.ts';

  let { line, actions }: { line: Line; actions: Snippet } = $props();
</script>

<p class="line">
  {line.qty} × {line.name}
  {@render actions()}
</p>
