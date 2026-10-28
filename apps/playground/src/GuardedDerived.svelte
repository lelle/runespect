<script lang="ts">
  let data: { user: { name: string } | null } = $state({ user: null });
  let name = $derived(data.user!.name);
</script>

<button onclick={() => (data.user = { name: 'Ada' })}>log in</button>
{#if data.user}<p>{name}</p>{/if}
