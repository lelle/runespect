<script lang="ts">
  import type { Notice } from './notice.svelte';

  // `floating`: over the bottom of the view (the panel), else at the top of what scrolls (the overlay).
  let { notice, floating = false }: { notice: Notice; floating?: boolean } = $props();
</script>

{#if notice.text}
  <div class="rs-notice" class:floating role="status" data-testid="runespect-notice">
    {notice.text}
  </div>
{/if}

<style>
  .rs-notice {
    position: sticky;
    top: 0;
    z-index: 3;
    margin-bottom: 6px;
    padding: 6px 10px;
    border: 1px solid var(--rs-border);
    border-radius: 6px;
    background: var(--rs-bg-elev);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }
  .floating {
    position: absolute;
    top: auto;
    inset-inline: 8px;
    inset-block-end: 8px;
    margin: 0;
  }
</style>
