<script lang="ts">
  import { setContext } from 'svelte';
  import ContextConsumer from './ContextConsumer.svelte';

  setContext('greeting', 'hi from context');
</script>

<ContextConsumer />
