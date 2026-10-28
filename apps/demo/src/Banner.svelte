<script lang="ts">
  // An older component in legacy mode, as apps that predate runes still have.
  export let code: string;
  let dismissed = false;
  $: message = `Spring sale: ${code} takes 10 % off`;
</script>

{#if !dismissed}
  <p class="banner">
    {message}
    <button on:click={() => (dismissed = true)} aria-label="dismiss">×</button>
  </p>
{/if}

<style>
  .banner {
    background: #f1edff;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
  }
</style>
