<script lang="ts">
  import { getContext } from 'svelte';

  // Consumes context set by an ancestor — captured by the preprocessor as kind "context".
  const greeting = getContext<string>('greeting');
</script>

<p>{greeting}</p>
