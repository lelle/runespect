<svelte:options css="injected" />

<script lang="ts">
  // The state filter lives in the settings menu and is remembered between sessions, so while it is
  // on this says why components are missing from the tree, and turns it off.
  let { onClear }: { onClear: () => void } = $props();
</script>

<div class="rs-state-filter" data-testid="runespect-state-filter">
  Hiding components without state
  <button type="button" aria-label="Turn off the state filter" onclick={onClear}>×</button>
</div>

<style>
  .rs-state-filter {
    display: flex;
    flex: none;
    width: fit-content;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
    padding: 0 4px 0 6px;
    border-radius: 3px;
    border: 1px solid var(--rs-border);
    color: var(--rs-fg);
    font-size: 11px;
  }
  .rs-state-filter button {
    background: transparent;
    color: inherit;
    border: 0;
    cursor: pointer;
    font: inherit;
    padding: 0 2px;
  }
</style>
