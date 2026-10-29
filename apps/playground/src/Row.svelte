<script lang="ts">
  let { name }: { name: string } = $props();
  let picked = $state(false);
</script>

<span class="name"><b>{name}</b></span>
<button onclick={() => (picked = !picked)}>{picked ? 'picked' : 'pick'}</button>
