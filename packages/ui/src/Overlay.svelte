<svelte:options css="injected" />

<script lang="ts">
  import * as agent from '@runespect/agent/internal';
  import Tree from './Tree.svelte';
  import { clipboardText } from './valueView';
  import { themeStyle, THEMES, type ThemeSetting } from './theme';
  import { Theme } from './theme.svelte';
  import { Search } from './search.svelte';
  import { Preferences } from './preferences.svelte';
  import SettingsMenu from './SettingsMenu.svelte';
  import { EMPTY, hold, shown, type Held } from './held';
  import type { SerializedNode } from '@runespect/agent/protocol/internal';

  // In-app overlay: feeds the live agent's serialized tree into the presentational
  // Tree, and routes edits straight back to the agent.
  // The overlay is a panel: opening it is what starts the agent reading the app's values.
  agent.activate();
  let open = $state(true);
  // The overlay shares the page with the agent, so an expanded value (a class instance, the one
  // thing serialize() stubs at full depth) is read afresh on every update instead of fetched once.
  let asked: Held = $state.raw(EMPTY);
  let sent = $derived(agent.serialize());
  let nodes = $derived(shown({ sent, fetched: asked.fetched }, agent.inspectPath));

  // `limit` is not written `limit?:` — Svelte 5.40–5.50 cannot strip an optional parameter's type.
  function inspect(
    id: number,
    path: (string | number)[],
    limit: number | undefined = undefined,
  ): void {
    asked = hold(asked, { type: 'asked', id, path, limit }).state;
  }
  // Shared with the panel, under the same keys.
  const prefs = new Preferences();
  const theme = new Theme();
  // A search match is selected and highlighted in the page, directly: the overlay is in it.
  const search = new Search(
    () => nodes,
    (id) => {
      selectedId = id;
      highlightNode(id);
    },
  );

  // ── element picker ──
  // While picking, hovering the page highlights the nearest component and clicking selects
  // it in the tree. ESC (or clicking the pick button again) cancels. Dev-only; relies on
  // Svelte's __svelte_meta, so it works in the in-app overlay (main world).
  let picking = $state(false);
  let selectedId = $state<number | null>(null);
  // The rect is rendered position:fixed, so it has to be recomputed whenever the page moves under
  // it — otherwise the outline stays where the element used to be as soon as you scroll. Keeping
  // the elements (not just their rect) is what makes that possible.
  let hoverEls: Element[] = [];
  let hoverRect = $state<DOMRect | null>(null);
  let hoverName = $state('');
  $effect(() => {
    if (!hoverRect) return;
    const reposition = (): void => {
      hoverRect = agent.boundsOf(hoverEls);
    };
    // Capture: a scroll inside a container does not bubble to the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  });
  function highlightEls(elements: Element[], name = ''): void {
    hoverEls = elements;
    hoverRect = agent.boundsOf(elements);
    hoverName = name;
  }

  // Every element of a node's instance, named; nothing when it has none in the page.
  function highlightInstance(id: number | null): void {
    const node = id == null ? undefined : nodes.find((n) => n.id === id);
    highlightEls(node ? agent.elementsForNode(node, nodes) : [], node?.name);
  }
  let overlayEl: HTMLElement | undefined = $state();

  function stopPicking(): void {
    picking = false;
    highlightEls([]);
  }

  // The picker listens on the document, where an event from inside the overlay's shadow root
  // arrives with the shadow host as its target; the composed path still names the overlay.
  const inOverlay = (e: Event): boolean => !!overlayEl && e.composedPath().includes(overlayEl);

  function onMove(e: MouseEvent): void {
    const target = e.target as Element;
    if (inOverlay(e)) {
      highlightEls([]);
      return;
    }
    // What a click here would pick: the instance, not the element under the pointer.
    highlightInstance(agent.nodeIdForElement(target, nodes));
  }

  function onClick(e: MouseEvent): void {
    const target = e.target as Element;
    if (inOverlay(e)) return; // let overlay clicks (e.g. the pick button) work
    e.preventDefault();
    e.stopPropagation();
    selectedId = agent.nodeIdForElement(target, nodes);
    stopPicking();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // it ends the picker; the page's own Escape handling is not for this one
    stopPicking();
  }

  // Reverse of the picker: hovering a tree node highlights its element in the page.
  function highlightNode(id: number | null): void {
    if (id == null) {
      if (!picking) highlightEls([]);
      return;
    }
    highlightInstance(id);
  }

  $effect(() => {
    if (!picking) return;
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  });
</script>

{#if open}
  <aside
    bind:this={overlayEl}
    class="runespect-overlay"
    data-testid="runespect-overlay"
    data-theme={theme.resolved}
    style={themeStyle(theme.resolved)}
  >
    <header>
      <strong>runespect</strong>
      <span class="actions">
        <button
          class="pick"
          class:active={picking}
          data-testid="runespect-pick"
          aria-pressed={picking}
          onclick={() => (picking ? stopPicking() : (picking = true))}>⌖ pick</button
        >
        <button
          class="pick"
          class:active={prefs.onlyStateful}
          data-testid="runespect-only-stateful"
          aria-pressed={prefs.onlyStateful}
          title="Show only components with reactive values"
          onclick={() => (prefs.onlyStateful = !prefs.onlyStateful)}>state</button
        >
        <SettingsMenu
          items={[
            { label: 'Flash on update', checked: prefs.flash, onChange: (v) => (prefs.flash = v) },
            {
              label: 'Expand values',
              checked: prefs.expandValues,
              onChange: (v) => (prefs.expandValues = v),
            },
            {
              kind: 'select',
              label: 'Theme',
              value: theme.setting,
              options: THEMES,
              onChange: (v) => (theme.setting = v as ThemeSetting),
            },
          ]}
        />
        <button
          class="close"
          aria-label="Close runespect"
          title="Close"
          onclick={() => (open = false)}>×</button
        >
      </span>
    </header>
    <div class="search-row">
      <input
        class="search"
        type="search"
        placeholder="Filter (text or /regex/)"
        aria-label="Filter components by name"
        data-testid="runespect-search"
        value={search.query}
        oninput={(e) => search.set(e.currentTarget.value)}
        onkeydown={(e) => search.key(e)}
      />
      {#if search.status}
        <span class="search-count" data-testid="runespect-search-count">{search.status}</span>
      {/if}
    </div>
    <Tree
      {sent}
      {nodes}
      {selectedId}
      filter={search.query}
      onlyStateful={prefs.onlyStateful}
      flash={prefs.flash}
      expandValues={prefs.expandValues}
      openInEditor={agent.openInEditor()}
      onHover={highlightNode}
      onEdit={(id, sym, path, v) => agent.setValue(id, sym, v, path)}
      onInspect={(id, sym, path, limit) => inspect(id, [sym, ...path], limit)}
      onLog={(node: SerializedNode) =>
        console.log(`%c[runespect] <${node.name}>`, 'color:#c2410c', node)}
      onCopy={(v: unknown) => navigator.clipboard?.writeText(clipboardText(v))}
      onStoreGlobal={(_id: number, _sym: string, v: unknown) => {
        (window as unknown as { $r: unknown }).$r = v;
        console.log('[runespect] window.$r =', v);
      }}
    />
  </aside>
{:else}
  <button class="runespect-reopen" onclick={() => (open = true)}>runespect</button>
{/if}

{#if hoverRect}
  <div
    class="rs-pick-highlight"
    data-testid="runespect-highlight"
    style="top:{hoverRect.top}px;left:{hoverRect.left}px;width:{hoverRect.width}px;height:{hoverRect.height}px;"
  >
    {#if hoverName}<span class="rs-pick-label" class:inside={hoverRect.top < 16}>{hoverName}</span
      >{/if}
  </div>
{/if}

<style>
  .runespect-overlay {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    max-height: 100vh;
    overflow: auto;
    background: var(--rs-bg);
    color: var(--rs-fg);
    font:
      12px/1.5 ui-monospace,
      monospace;
    padding: 8px;
    z-index: 2147483647;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  button {
    background: transparent;
    color: inherit;
    border: 1px solid var(--rs-border);
    cursor: pointer;
  }
  .pick.active {
    background: var(--rs-accent);
    color: var(--rs-on-accent);
    border-color: var(--rs-accent);
  }
  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .search {
    flex: 1;
    box-sizing: border-box;
    padding: 2px 6px;
    background: var(--rs-bg-elev);
    color: var(--rs-fg);
    border: 1px solid var(--rs-border);
    font: inherit;
  }
  .search-count {
    color: var(--rs-muted);
    white-space: nowrap;
  }
  /* rendered outside the themed root (floats over the host page) → theme-independent literals */
  .runespect-reopen {
    position: fixed;
    top: 0;
    right: 0;
    background: #1e1e1e;
    color: #e0e0e0;
    border: 1px solid #444;
    cursor: pointer;
    z-index: 2147483647;
  }
  .rs-pick-highlight {
    position: fixed;
    pointer-events: none;
    background: rgba(194, 65, 12, 0.2);
    outline: 2px solid #c2410c;
    z-index: 2147483646;
  }
  /* The component's name, on the box's top edge, or just inside it at the top of the viewport. */
  .rs-pick-label {
    position: absolute;
    top: -16px;
    left: -2px;
    padding: 1px 4px;
    background: #c2410c;
    color: #fff;
    font:
      11px/14px system-ui,
      sans-serif;
    white-space: nowrap;
  }
  .rs-pick-label.inside {
    top: 0;
  }
</style>
