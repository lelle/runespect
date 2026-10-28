<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>Not found · runespect</title>
</svelte:head>

<main id="content" class="home">
  <h1>Not found</h1>
  <p class="lede">
    There is nothing at this address. Try the <a href={resolve('/')}>front page</a> or the
    <a href="{resolve('/')}docs/">docs</a>.
  </p>
</main>
