<svelte:options css="injected" />

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { errorValue } from '@runespect/agent/protocol/internal';

  // One pane that fails to render (a value from an agent on another protocol version, a bug in a
  // view) shows its error in place, and the rest of the panel keeps working.
  let {
    name,
    onError = () => {},
    children,
  }: {
    name: string;
    onError?: (where: string, error: unknown) => void;
    children: Snippet;
  } = $props();

  function report(error: unknown): void {
    console.error(`[runespect] the ${name} pane failed`, error);
    onError(name, error);
  }
</script>

<svelte:boundary onerror={report}>
  {@render children()}
  {#snippet failed(error, reset)}
    <div class="rs-pane-error" data-pane-error={name}>
      <p>This pane failed: {errorValue(error).message}</p>
      <button data-pane-retry={name} onclick={reset}>Try again</button>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .rs-pane-error {
    padding: 8px;
    color: var(--rs-muted);
  }
  .rs-pane-error p {
    margin: 0 0 6px;
  }
  .rs-pane-error button {
    background: transparent;
    border: 1px solid var(--rs-border);
    color: var(--rs-fg);
    cursor: pointer;
    font: inherit;
  }
</style>
