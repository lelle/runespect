<svelte:options css="injected" />

<script lang="ts">
  import { dismissOn } from './dismiss';
  import type { SettingItem } from './settings';

  // A gear button that opens a dropdown of settings rows (boolean toggles + selects). Self-closing:
  // Escape or a click outside the whole control (gear + dropdown) closes it. The host passes `items`
  // and owns their state + persistence; this only presents and dismisses. Used in the panel toolbar
  // and overlay header. `footer` holds inert lines (the panel's build identity), set apart from the
  // rows above so it never reads as another setting.
  let { items, footer = [] }: { items: SettingItem[]; footer?: string[] } = $props();

  let open = $state(false);
  let rootEl: HTMLElement;

  $effect(() => {
    if (!open) return;
    return dismissOn(
      () => rootEl,
      () => (open = false),
    );
  });
</script>

<div class="rs-settings" bind:this={rootEl}>
  <button
    type="button"
    class="gear"
    data-testid="runespect-settings"
    aria-label="Settings"
    aria-expanded={open}
    onclick={() => (open = !open)}>⚙</button
  >
  {#if open}
    <ul class="rs-settings-menu" data-testid="runespect-settings-menu" aria-label="Settings">
      {#each items as item (item.label)}
        <li>
          {#if item.kind === 'select'}
            <label>
              {item.label}
              <select
                data-setting={item.label}
                value={item.value}
                onchange={(e) => item.onChange(e.currentTarget.value)}
              >
                {#each item.options as opt (opt)}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label>
              <input
                type="checkbox"
                data-setting={item.label}
                checked={item.checked}
                onchange={(e) => item.onChange(e.currentTarget.checked)}
              />
              {item.label}
            </label>
          {/if}
        </li>
      {/each}
      {#if footer.length}
        <li class="rs-settings-footer" data-testid="runespect-build-info">
          {#each footer as line (line)}
            <div>{line}</div>
          {/each}
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .rs-settings-footer {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--rs-border-soft);
    color: var(--rs-muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .rs-settings {
    position: relative;
    display: inline-flex;
  }
  .gear {
    background: transparent;
    color: inherit;
    border: 1px solid var(--rs-border);
    cursor: pointer;
    font: inherit;
    padding: 0 6px;
  }
  .rs-settings-menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 2147483647;
    min-width: 180px;
    margin: 2px 0 0;
    padding: 4px 0;
    list-style: none;
    background: var(--rs-bg-elev);
    border: 1px solid var(--rs-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    color: var(--rs-fg);
  }
  .rs-settings-menu label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .rs-settings-menu label:hover {
    background: var(--rs-accent);
    color: var(--rs-on-accent);
  }
  .rs-settings-menu select {
    margin-left: auto;
    background: var(--rs-bg-elev);
    color: var(--rs-fg);
    border: 1px solid var(--rs-border);
    font: inherit;
  }
</style>
