<script lang="ts">
  import Counter from './Counter.svelte';
  let show = $state<boolean>(true);
</script>

{#if show}<Counter start={1} />{/if}
<button onclick={() => (show = !show)}>toggle</button>
