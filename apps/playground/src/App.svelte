<script lang="ts">
  import Counter from './Counter.svelte';
  let title = $state<string>('runespect');
</script>

<h1>{title}</h1>
<Counter start={1} />
<Counter start={10} />
