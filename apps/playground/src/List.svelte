<script lang="ts">
  let { items = [] }: { items?: string[] } = $props();
</script>

<ul>
  {#each items as item (item)}{@render row(item)}{/each}
</ul>

{#snippet row(item: string)}
  <li>{item}</li>
{/snippet}
