<svelte:options css="injected" />

<script lang="ts">
  import type { MenuItem } from './contextMenu';
  import { dismissOn } from './dismiss';

  // A small node menu rendered at (x, y), opened by a right-click or the menu key. Self-closing:
  // Escape or any click outside the menu calls onclose. It takes focus while open, moves it with the
  // arrow keys, and gives it back to whatever had it. The host owns open/position/items.
  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } =
    $props();

  let menuEl: HTMLElement;

  // Opened at the pointer, then moved back inside the window if it would cross its edge, so near
  // the right or bottom of a small DevTools pane it never renders half off-screen.
  let left = $state(0);
  let top = $state(0);
  $effect(() => {
    const root = menuEl.getRootNode() as Document | ShadowRoot;
    const opener = root.activeElement as HTMLElement | null;
    enabledItems()[0]?.focus();
    return () => opener?.focus();
  });
  const enabledItems = (): HTMLButtonElement[] => [
    ...menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  ];
  function onMenuKey(e: KeyboardEvent): void {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const items = enabledItems();
    const at = items.indexOf(e.target as HTMLButtonElement);
    items[(at + step + items.length) % items.length]?.focus();
  }

  $effect(() => {
    const { width, height } = menuEl.getBoundingClientRect();
    left = Math.max(0, Math.min(x, window.innerWidth - width));
    top = Math.max(0, Math.min(y, window.innerHeight - height));
  });

  // Opened by a contextmenu event or the menu key, so no stray left-click closes it on open.
  $effect(() =>
    dismissOn(
      () => menuEl,
      () => onclose(),
    ),
  );

  function run(item: MenuItem): void {
    if (item.disabled) return;
    item.onClick();
    onclose();
  }
</script>

<ul
  bind:this={menuEl}
  class="rs-menu"
  data-testid="runespect-context-menu"
  role="menu"
  style="top:{top}px;left:{left}px"
  onkeydown={onMenuKey}
>
  {#each items as item (item.label)}
    <li role="none">
      <button role="menuitem" disabled={item.disabled} onclick={() => run(item)}
        >{item.label}</button
      >
    </li>
  {/each}
</ul>

<style>
  .rs-menu {
    position: fixed;
    z-index: 2147483647;
    min-width: 160px;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    background: var(--rs-bg-elev);
    border: 1px solid var(--rs-border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    font:
      12px/1.5 ui-monospace,
      monospace;
    color: var(--rs-fg);
  }
  .rs-menu button {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 3px 12px;
    background: transparent;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .rs-menu button:hover:not(:disabled) {
    background: var(--rs-accent);
    color: var(--rs-on-accent);
  }
  .rs-menu button:disabled {
    color: var(--rs-muted-2);
    cursor: default;
  }
</style>
