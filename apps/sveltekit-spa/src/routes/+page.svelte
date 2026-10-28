<script lang="ts">
  import Counter from '#lib/Counter.svelte';
  import Greeting from '#lib/Greeting.svelte';

  let name = $state('SvelteKit');
</script>

<h1>runespect — SvelteKit SPA</h1>

<Greeting {name} />
<Counter start={1} />
<Counter start={10} />

<label>
  name:
  <input bind:value={name} />
</label>
