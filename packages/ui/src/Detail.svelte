<svelte:options css="injected" />

<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { SerializedNode } from '@runespect/agent/protocol/internal';
  import { detailGroups } from './detail';
  import { editorUrl, DEFAULT_EDITOR_TEMPLATE } from './editor';
  import { Flasher } from './flash.svelte';
  import type { MenuItem } from './contextMenu';
  import ValueRow from './ValueRow.svelte';
  import ContextMenu from './ContextMenu.svelte';

  // Detail pane for the selected node (React-style split): the tree shows names only, and the
  // selected node's values are grouped here by category (props/state/derived/stores/class).
  // Presentational — edits/copy/store-as-global round-trip via callbacks, like <Tree>.
  let {
    node = null,
    sent,
    onEdit = () => {},
    onCopy = () => {},
    onStoreGlobal = () => {},
    onLog = () => {},
    onInspect = () => {},
    editorTemplate = DEFAULT_EDITOR_TEMPLATE,
    openInEditor = true,
    expandValues = false,
  }: {
    node?: SerializedNode | null;
    /** The node as the page sent it, without the values the panel fetched: what flashing compares. */
    sent?: SerializedNode | null;
    onEdit?: (id: number, symbol: string, path: (string | number)[], value: unknown) => void;
    onCopy?: (value: unknown) => void;
    onStoreGlobal?: (id: number, symbol: string, value: unknown) => void;
    onLog?: (node: SerializedNode) => void;
    onInspect?: (id: number, symbol: string, path: (string | number)[], limit?: number) => void;
    editorTemplate?: string;
    openInEditor?: boolean;
    /** Start each value's top level expanded (settings toggle). */
    expandValues?: boolean;
  } = $props();

  let groups = $derived(node ? detailGroups(node) : []);

  // Flash a value row when it changes (highlight-updates in the panel detail view).
  const flasher = new Flasher();
  $effect(() => {
    const n = sent === undefined ? node : sent;
    untrack(() => flasher.update(n ? [n] : []));
  });
  onDestroy(() => flasher.destroy());

  // ── right-click context menu (per value row) ──
  let menu = $state<{ x: number; y: number; sym: string; val: unknown } | null>(null);
  function openRowMenu(e: MouseEvent, sym: string, val: unknown): void {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, sym, val };
  }
  function rowMenuItems(sym: string, val: unknown): MenuItem[] {
    return [
      { label: 'Copy value', onClick: () => onCopy(val) },
      { label: 'Store as $r', onClick: () => node && onStoreGlobal(node.id, sym, val) },
      { label: 'Log to console', onClick: () => node && onLog(node) },
    ];
  }
</script>

{#if node}
  <div class="rs-detail" data-testid="runespect-detail">
    <header class="rs-detail-head">
      <span class="rs-detail-name">&lt;{node.name}&gt;</span>
      {#if node.loc && openInEditor}
        <a
          class="rs-detail-source"
          data-detail-source
          href={editorUrl(node.loc, editorTemplate)}
          target="_blank"
          rel="noreferrer"
          title="Open in editor">&lt;/&gt;</a
        >
      {/if}
      <button
        class="rs-detail-log"
        data-detail-log={node.name}
        title="Log to console"
        aria-label="Log to console"
        onclick={() => onLog(node)}>⎙</button
      >
    </header>

    {#each groups as group (group.kind)}
      <section class="rs-group" data-group={group.kind}>
        <h4 class="rs-group-label">{group.label}</h4>
        {#each group.symbols as sym (sym)}
          {@const val = node.values[sym]}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="rs-row"
            data-detail-row={`${node.name}.${sym}`}
            oncontextmenu={(e) => openRowMenu(e, sym, val)}
          >
            <span class="rs-sym">{sym}</span>
            <ValueRow
              {node}
              {sym}
              {val}
              flashing={flasher.isFlashing(node.id, sym)}
              flashAgain={flasher.flashAgain(node.id, sym)}
              defaultExpanded={expandValues}
              {onEdit}
              {onInspect}
              editAttr="data-detail-edit"
              valueAttr="data-detail-value"
            />
            <button
              class="rs-act"
              data-detail-copy={`${node.name}.${sym}`}
              title="Copy value"
              aria-label="Copy value"
              onclick={() => onCopy(val)}>⧉</button
            >
            <button
              class="rs-act"
              data-detail-global={`${node.name}.${sym}`}
              title="Store as window.$r"
              aria-label="Store as window.$r"
              onclick={() => onStoreGlobal(node.id, sym, val)}>$r</button
            >
          </div>
        {/each}
      </section>
    {/each}

    {#if node.snippets.length}
      <section class="rs-group" data-group="snippet">
        <h4 class="rs-group-label">snippets</h4>
        {#each node.snippets as snip (snip)}
          <div class="rs-row"><span class="rs-sym">{'{#snippet}'}</span> {snip}</div>
        {/each}
      </section>
    {/if}

    {#if !groups.length && !node.snippets.length}
      <p class="rs-detail-none">No reactive values.</p>
    {/if}
  </div>
{:else}
  <div class="rs-detail" data-testid="runespect-detail">
    <p class="rs-detail-empty" data-detail-empty>Select a component to inspect.</p>
  </div>
{/if}

{#if menu}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={rowMenuItems(menu.sym, menu.val)}
    onclose={() => (menu = null)}
  />
{/if}

<style>
  .rs-detail {
    padding: 0 4px;
  }
  .rs-detail-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rs-border-soft);
  }
  .rs-detail-name {
    color: var(--rs-name);
    font-weight: bold;
  }
  .rs-detail-source {
    color: var(--rs-muted);
    text-decoration: none;
  }
  .rs-detail-source:hover {
    color: var(--rs-fg);
  }
  .rs-detail-log {
    background: transparent;
    border: none;
    color: var(--rs-muted);
    cursor: pointer;
    font-size: 11px;
    margin-left: auto;
  }
  .rs-detail-log:hover {
    color: var(--rs-fg);
  }
  .rs-group {
    margin-bottom: 8px;
  }
  .rs-group-label {
    margin: 0 0 2px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--rs-muted-2);
  }
  .rs-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 0;
  }
  .rs-row:hover .rs-act,
  .rs-act:focus-visible {
    opacity: 1;
  }
  .rs-sym {
    color: var(--rs-sym);
  }
  .rs-act {
    background: transparent;
    border: none;
    color: var(--rs-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 0 3px;
    opacity: 0;
  }
  .rs-act:hover {
    color: var(--rs-fg);
  }
  .rs-detail-empty,
  .rs-detail-none {
    color: var(--rs-muted-2);
    font-style: italic;
  }
</style>
