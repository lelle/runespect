<script lang="ts">
  let { total, onplace }: { total: number; onplace: (name: string) => void } = $props();
  let name = $state('');
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    onplace(name);
  }}
>
  <label>Name <input bind:value={name} required /></label>
  <button>Place order</button> for {total.toFixed(2)}
</form>
