<script lang="ts">
  import Row from './Row.svelte';

  let { filter = '' }: { filter?: string } = $props();
  const names = ['Apple', 'Bread', 'Coffee'];
  const shown = $derived(names.filter((name) => name.toLowerCase().includes(filter)));
</script>

<ul>
  {#each shown as name (name)}
    <li><Row {name} /></li>
  {/each}
</ul>
