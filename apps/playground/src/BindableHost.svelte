<script lang="ts">
  import Field from './Field.svelte';
  let name = $state<string>('hi');
</script>

<Field bind:value={name} />
<p>{name}</p>
