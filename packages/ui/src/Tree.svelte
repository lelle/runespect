<svelte:options css="injected" />

<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { SerializedNode } from '@runespect/agent/protocol/internal';
  import { Flasher } from './flash.svelte';
  import { editorUrl, DEFAULT_EDITOR_TEMPLATE } from './editor';
  import { navigate, treeView, visibleRows, type TreeRow } from './treeNav';
  import { windowRange, scrollTopForRow, ROW_HEIGHT } from './virtual';
  import type { MenuItem } from './contextMenu';
  import ValueRow from './ValueRow.svelte';
  import ContextMenu from './ContextMenu.svelte';

  // Presentational: renders a flat SerializedNode[] as a tree. No agent dependency, so
  // both the in-app overlay (live agent data) and the extension panel (message-derived
  // data) can reuse it. Edits are reported via onEdit(id, symbol, path, value).
  let {
    nodes = [],
    sent,
    onEdit = () => {},
    onHover = () => {},
    onLog = () => {},
    onCopy = () => {},
    onStoreGlobal = () => {},
    onSelect = () => {},
    onInspect = () => {},
    editorTemplate = DEFAULT_EDITOR_TEMPLATE,
    openInEditor = true,
    selectedId = null,
    filter = '',
    onlyStateful = false,
    exclude = '',
    namesOnly = false,
    flash = true,
    expandValues = false,
  }: {
    nodes?: SerializedNode[];
    /** What the page sent, without the values the panel fetched: what flashing compares. */
    sent?: readonly SerializedNode[];
    onEdit?: (id: number, symbol: string, path: (string | number)[], value: unknown) => void;
    onHover?: (id: number | null) => void;
    onLog?: (node: SerializedNode) => void;
    onCopy?: (value: unknown) => void;
    onStoreGlobal?: (id: number, symbol: string, value: unknown) => void;
    onSelect?: (id: number | null) => void;
    onInspect?: (id: number, symbol: string, path: (string | number)[], limit?: number) => void;
    editorTemplate?: string;
    openInEditor?: boolean;
    selectedId?: number | null;
    filter?: string;
    onlyStateful?: boolean;
    /** Comma-separated name/file fragments to hide (their children re-parent up). */
    exclude?: string;
    namesOnly?: boolean;
    /** Blink a value (or name, in names-only) when its $state changes. Off via the settings menu. */
    flash?: boolean;
    /** Start each value's top level expanded (settings toggle). */
    expandValues?: boolean;
  } = $props();

  // What shows, for both forms of the tree: exclusion, the filters, the roots, and which nodes are
  // open. A filter opens every kept node, so the path to a match is never hidden by a collapse.
  const collapsed = new SvelteSet<number>();
  let view = $derived(treeView(nodes, { query: filter, onlyStateful, exclude, collapsed }));
  let effectiveNodes = $derived(view.nodes);
  let byId = $derived(view.byId);
  let roots = $derived(view.roots);

  // ── scroll-selected-into-view ── (keyboard nav or picker can move the selection outside the
  // viewport; bring its row's name line back into view, minimally — matches React DevTools)
  let rootEl = $state<HTMLUListElement>();
  // Tracks the selection and the measured viewport height only: reading the scroll offset (or the
  // row list) reactively would re-run this on every scroll or tree update and yank the view back to
  // the selected row while the user is browsing elsewhere.
  $effect(() => {
    const id = selectedId;
    const height = viewportHeight;
    if (id == null) return;
    untrack(() => {
      // Virtualized: a row outside the rendered window has no element to scrollIntoView, so scroll
      // to it by index instead — the next pass then renders it at the viewport edge.
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0 && viewportEl) {
        const next = scrollTopForRow(idx, scrollTop, height);
        if (next != null) {
          viewportEl.scrollTop = next;
          scrollTop = next;
          return;
        }
      }
      const row = rootEl?.querySelector('.rs-selected > .name');
      row?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  });

  // ── flash-on-update ── (shared Flasher: blink a value when its $state changes; in names-only
  // mode the node name flashes instead, since values are hidden)
  const flasher = new Flasher();
  $effect(() => {
    const current = sent ?? effectiveNodes;
    if (!flash) return; // comparing every value of every node costs; nobody is looking
    untrack(() => flasher.update(current));
  });
  onDestroy(() => flasher.destroy());

  // ── collapse/expand subtrees ──
  // A node id in `collapsed` hides its child component nodes (its own values still show).
  function setCollapsed(id: number, value: boolean): void {
    if (value) collapsed.add(id);
    else collapsed.delete(id);
  }

  // ── virtualized rows (names-only) ──
  // The panel tree flattens to fixed-height rows, so only the window in view is put in the DOM;
  // spacers above and below stand in for the rest and keep the scrollbar the size of the whole
  // tree. An unmeasured viewport (before layout) renders every row — see virtual.ts.
  const INDENT_PX = 12; // per-depth indent of a flat row, matching the nested tree's ul padding
  let viewportEl = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let rows = $derived(namesOnly ? visibleRows(effectiveNodes, view.visibleIds, collapsed) : []);
  let rowWindow = $derived(windowRange(rows.length, scrollTop, viewportHeight));
  let windowedRows = $derived(rows.slice(rowWindow.start, rowWindow.end));
  $effect(() => {
    const el = viewportEl;
    if (!el) return;
    const measure = (): number => (viewportHeight = el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return; // jsdom: stays on the render-everything path
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Keyboard navigation (names-only / panel tree): ↑/↓ move, Alt+↑/↓ sibling-only, Home/End jump,
  // Esc clears, ←/→ collapse/expand or walk to parent/first child. Logic is in navigate() (pure).
  // While navigating we highlight the selected node in the page and suppress hover-highlight (so
  // the mouse resting over the tree doesn't fight the keyboard); a real mousemove clears the flag.
  let navByKeyboard = $state(false);

  // Focus stays on the tree itself: a focused row button is destroyed once the selection leaves
  // the rendered window, and focus would fall to <body>. Screen readers follow the selection
  // through aria-activedescendant, and each row says where it sits among its siblings, which a
  // virtualized tree cannot leave to the DOM.
  const uid = $props.id();
  const rowId = (id: number): string => `${uid}-row-${id}`;
  let activeDescendant = $derived(
    selectedId != null && windowedRows.some((r) => r.id === selectedId)
      ? rowId(selectedId)
      : undefined,
  );
  function keepFocusOnTree(e: FocusEvent): void {
    if (e.target !== rootEl) rootEl?.focus();
  }
  function onKeyNav(e: KeyboardEvent): void {
    if (!namesOnly) return;
    // The menu key, or Shift+F10, opens the selected node's menu below its row.
    if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && selectedId != null) {
      const node = effectiveNodes.find((n) => n.id === selectedId);
      if (!node) return;
      e.preventDefault();
      const row = rootEl?.querySelector('.rs-selected')?.getBoundingClientRect();
      menu = { x: row?.left ?? 0, y: row?.bottom ?? 0, node };
      return;
    }
    const res = navigate(effectiveNodes, view.visibleIds, selectedId, e.key, collapsed, e.altKey);
    if (!res) return;
    e.preventDefault();
    navByKeyboard = true;
    if ('collapse' in res) setCollapsed(res.collapse, true);
    else if ('expand' in res) setCollapsed(res.expand, false);
    else {
      onSelect(res.id);
      onHover(res.id);
    }
  }

  // ── right-click context menu (per node) ──
  // Consolidates the node-level actions, the only access in names-only mode (no inline buttons).
  let menu = $state<{ x: number; y: number; node: SerializedNode } | null>(null);
  function openMenu(e: MouseEvent, node: SerializedNode): void {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, node };
  }
  function nodeMenuItems(node: SerializedNode): MenuItem[] {
    const open: MenuItem = {
      label: 'Open in editor',
      disabled: !node.loc,
      onClick: () => {
        if (node.loc) window.open(editorUrl(node.loc, editorTemplate), '_blank', 'noreferrer');
      },
    };
    return [
      ...(openInEditor ? [open] : []),
      { label: 'Log to console', onClick: () => onLog(node) },
      { label: 'Highlight in page', onClick: () => onHover(node.id) },
      { label: 'Copy name', onClick: () => onCopy(node.name) },
    ];
  }
</script>

{#snippet tree(node: SerializedNode)}
  <li class="node" class:rs-selected={node.id === selectedId} data-component={node.name}>
    {#if node.children.length}
      <button
        type="button"
        class="twirl"
        data-collapse={node.name}
        aria-expanded={view.isExpanded(node.id)}
        title={view.isExpanded(node.id) ? 'Collapse' : 'Expand'}
        aria-label={view.isExpanded(node.id) ? 'Collapse' : 'Expand'}
        onclick={() => setCollapsed(node.id, view.isExpanded(node.id))}
        >{view.isExpanded(node.id) ? '▾' : '▸'}</button
      >
    {:else}
      <span class="twirl-spacer"></span>
    {/if}
    {#if node.loc && openInEditor}
      <a
        class="name"
        data-open={node.name}
        href={editorUrl(node.loc, editorTemplate)}
        target="_blank"
        rel="noreferrer"
        oncontextmenu={(e) => openMenu(e, node)}
        onmouseenter={() => onHover(node.id)}
        onmouseleave={() => onHover(null)}>{node.name}</a
      >
    {:else}
      <button
        type="button"
        class="name name-btn"
        oncontextmenu={(e) => openMenu(e, node)}
        onmouseenter={() => onHover(node.id)}
        onmouseleave={() => onHover(null)}>{node.name}</button
      >
    {/if}
    <button
      class="act log"
      data-log={node.name}
      title="Log to console"
      aria-label="Log to console"
      onclick={() => onLog(node)}>⎙</button
    >
    <ul class="values">
      {#each Object.entries(node.values) as [sym, val] (sym)}
        <li class="value" data-symbol={sym}>
          <span class="sym">{sym}</span>
          <ValueRow
            {node}
            {sym}
            {val}
            flashing={flash && flasher.isFlashing(node.id, sym)}
            flashAgain={flasher.flashAgain(node.id, sym)}
            defaultExpanded={expandValues}
            {onEdit}
            {onInspect}
            editAttr="data-edit"
            valueAttr="data-value"
          />
          <button
            class="act"
            data-copy={`${node.name}.${sym}`}
            title="Copy value"
            aria-label="Copy value"
            onclick={() => onCopy(val)}>⧉</button
          >
          <button
            class="act"
            data-global={`${node.name}.${sym}`}
            title="Store as window.$r"
            aria-label="Store as window.$r"
            onclick={() => onStoreGlobal(node.id, sym, val)}>$r</button
          >
        </li>
      {/each}
    </ul>
    {#if node.snippets.length}
      <ul class="snippets">
        {#each node.snippets as snip (snip)}
          <li class="snippet" data-snippet={`${node.name}.${snip}`}>
            <span class="sym">{'{#snippet}'}</span>
            {snip}
          </li>
        {/each}
      </ul>
    {/if}
    {#if node.children.length && view.isExpanded(node.id)}
      <ul class="children">
        {#each node.children as childId (childId)}
          {@const child = byId.get(childId)}
          {#if child && view.isVisible(childId)}{@render tree(child)}{/if}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet flatRow(row: TreeRow)}
  {@const node = byId.get(row.id)}
  {#if node}
    <li
      class="node rs-row"
      class:rs-selected={node.id === selectedId}
      data-component={node.name}
      id={rowId(node.id)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-setsize={row.setsize}
      aria-posinset={row.posinset}
      aria-selected={node.id === selectedId}
      aria-expanded={node.children.length ? view.isExpanded(node.id) : null}
      style:padding-left="{row.depth * INDENT_PX}px"
    >
      {#if node.children.length}
        <button
          type="button"
          class="twirl"
          tabindex="-1"
          data-collapse={node.name}
          title={view.isExpanded(node.id) ? 'Collapse' : 'Expand'}
          aria-label={view.isExpanded(node.id) ? 'Collapse' : 'Expand'}
          onclick={() => setCollapsed(node.id, view.isExpanded(node.id))}
          >{view.isExpanded(node.id) ? '▾' : '▸'}</button
        >
      {:else}
        <span class="twirl-spacer"></span>
      {/if}
      <button
        type="button"
        class="name name-btn name-select"
        tabindex="-1"
        class:rs-flash={flash && flasher.nodeFlashing(node.id)}
        class:rs-flash-again={flasher.nodeFlashAgain(node.id)}
        data-select={node.name}
        onclick={(e) =>
          onSelect((e.metaKey || e.ctrlKey) && node.id === selectedId ? null : node.id)}
        oncontextmenu={(e) => openMenu(e, node)}
        onmouseenter={() => {
          if (!navByKeyboard) onHover(node.id);
        }}
        onmouseleave={() => {
          if (!navByKeyboard) onHover(null);
        }}>{node.name}</button
      >
    </li>
  {/if}
{/snippet}

<svelte:window
  onmousemove={namesOnly
    ? () => {
        if (navByKeyboard) navByKeyboard = false;
      }
    : undefined}
/>

{#if namesOnly}
  <div
    class="rs-viewport"
    data-testid="runespect-tree-viewport"
    bind:this={viewportEl}
    onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
  >
    <ul
      class="roots"
      bind:this={rootEl}
      role="tree"
      tabindex="0"
      aria-label="Components"
      aria-activedescendant={activeDescendant}
      style:--rs-row-height="{ROW_HEIGHT}px"
      onkeydown={onKeyNav}
      onfocusin={keepFocusOnTree}
    >
      <li class="rs-pad-top" role="none" style:height="{rowWindow.padTop}px"></li>
      {#each windowedRows as row (row.id)}
        {@render flatRow(row)}
      {/each}
      <li class="rs-pad-bottom" role="none" style:height="{rowWindow.padBottom}px"></li>
    </ul>
  </div>
{:else}
  <ul class="roots" bind:this={rootEl}>
    {#each roots as root (root.id)}
      {@render tree(root)}
    {/each}
  </ul>
{/if}

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={nodeMenuItems(menu.node)}
    onclose={() => (menu = null)}
  />
{/if}

<style>
  .rs-viewport {
    height: 100%;
    overflow: auto;
  }
  .rs-row {
    box-sizing: border-box;
    height: var(--rs-row-height);
    line-height: var(--rs-row-height);
    white-space: nowrap;
    overflow: hidden;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 0 12px;
  }
  /* A component's values and snippets start under its name: past the twirl and the space after it. */
  .values,
  .snippets {
    padding-left: calc(12px + 1ch);
  }
  .name {
    color: var(--rs-name);
    font-weight: bold;
  }
  a.name {
    text-decoration: none;
    cursor: pointer;
  }
  a.name:hover {
    text-decoration: underline;
  }
  button.name-btn {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    cursor: default;
  }
  button.name-select {
    cursor: pointer;
  }
  button.name-select:hover {
    text-decoration: underline;
  }
  .twirl {
    background: transparent;
    border: none;
    color: var(--rs-muted);
    cursor: pointer;
    font: inherit;
    width: 12px;
    padding: 0;
    line-height: 1;
  }
  .twirl:hover {
    color: var(--rs-fg);
  }
  .twirl-spacer {
    display: inline-block;
    width: 12px;
  }
  .sym {
    color: var(--rs-sym);
  }
  .act {
    background: transparent;
    border: none;
    color: var(--rs-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 0 3px;
    opacity: 0;
  }
  .node:hover > .act,
  .value:hover > .act,
  .act:focus-visible {
    opacity: 1;
  }
  .act:hover {
    color: var(--rs-fg);
  }
  .node.rs-selected > .name {
    background: color-mix(in srgb, var(--rs-accent) 30%, transparent);
    outline: 1px solid var(--rs-accent);
    border-radius: 2px;
  }
  .rs-flash {
    animation: rs-flash 0.7s ease-out;
  }
  .rs-flash-again {
    animation-name: rs-flash-again;
  }
  @keyframes rs-flash {
    from {
      background: var(--rs-accent);
      color: var(--rs-on-accent);
    }
    to {
      background: transparent;
    }
  }
  @keyframes rs-flash-again {
    from {
      background: var(--rs-accent);
      color: var(--rs-on-accent);
    }
    to {
      background: transparent;
    }
  }
</style>
