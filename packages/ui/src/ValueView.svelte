<svelte:options css="injected" />

<script lang="ts">
  import { childStep, isDehydratedValue, isPartialValue } from '@runespect/agent/protocol/internal';
  import {
    formatValue,
    isExpandable,
    isEditableLeaf,
    entriesOf,
    valueType,
    truncateString,
    unsentCount,
    isLongString,
    STRING_LIMIT,
    ENTRY_LIMIT,
  } from './valueView';
  import { coerceInput } from './detail';
  import Self from './ValueView.svelte';

  // Recursive value renderer: primitives show their formatted text; objects/arrays/maps/sets show
  // a collapsed preview with a toggle that drills into their entries. When `editable`, primitive
  // leaves render as inputs that report edits as onEdit(path, value); editing only descends plain
  // objects/arrays (Map/Set entries can't be safely re-keyed), so children under them stay read-only.
  // A dehydrated value (lazy inspection) has no local entries — expanding it calls onInspect(path)
  // to fetch them; the host swaps the marker for the real subtree, which re-renders here, and an
  // update that brings the marker back fetches it again.
  let {
    value,
    editable = false,
    path = [],
    defaultExpanded = false,
    onEdit = () => {},
    onInspect = () => {},
  }: {
    value: unknown;
    editable?: boolean;
    path?: (string | number)[];
    /** Start this (top-level) value expanded. Nested entries stay collapsed (not propagated). */
    defaultExpanded?: boolean;
    onEdit?: (path: (string | number)[], value: unknown) => void;
    /** `limit`: how many entries of a partial value to send, when more are shown than it has. */
    onInspect?: (path: (string | number)[], limit?: number) => void;
  } = $props();

  // Intentional: seed from the prop once; the user's own expand/collapse then owns this node's
  // state. Toggling the setting applies to newly-rendered values, not ones already interacted with.
  // svelte-ignore state_referenced_locally
  let expanded = $state(defaultExpanded);
  let expandable = $derived(isExpandable(value));
  // Render-bounding: cap how many entries we render; "show more" reveals the next page.
  let shown = $state(ENTRY_LIMIT);
  let allEntries = $derived(expanded ? entriesOf(value) : []);
  let entries = $derived(allEntries.slice(0, shown));
  let hiddenCount = $derived(
    allEntries.length - entries.length + (expanded ? unsentCount(value) : 0),
  );
  // Long string leaves are truncated for display; the full value stays in the title.
  let longString = $derived(isLongString(value));

  function toggle(): void {
    expanded = !expanded;
    if (!expanded) shown = ENTRY_LIMIT; // reset paging on collapse
  }

  // An expanded marker is fetched: on the first expand, and again after an update replaced the
  // fetched subtree with a fresh marker. Once per marker, so a slow reply is not asked for twice.
  let requested: unknown = null;
  $effect(() => {
    if (!expanded || !isDehydratedValue(value) || value === requested) return;
    requested = value;
    onInspect(path);
  });
  // A partial value holds its first entries only: showing past them asks the page for more, again
  // after an update sent the first entries only.
  $effect(() => {
    if (!expanded || !isPartialValue(value) || shown <= allEntries.length || value === requested)
      return;
    requested = value;
    onInspect(path, shown);
  });

  // Keyboard nav inside the value tree: →/← expand/collapse the focused toggle (Enter/Space already
  // toggle via the native button); ↑/↓ move focus to the previous/next toggle in the same value
  // cell. Focus moves over the rendered [data-expand] buttons scoped to the cell's .rs-value.
  function focusToggle(from: HTMLElement, dir: 1 | -1): void {
    const scope = from.closest('.rs-value') ?? from.ownerDocument.body;
    const all = [...scope.querySelectorAll<HTMLElement>('[data-expand]')];
    all[all.indexOf(from) + dir]?.focus();
  }
  function onToggleKey(e: KeyboardEvent): void {
    const btn = e.currentTarget as HTMLElement;
    if (e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusToggle(btn, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusToggle(btn, -1);
    }
  }
  // Only object/array descent keeps a set-at-path that round-trips, so stop editing at Map/Set.
  let childrenEditable = $derived(
    editable && (valueType(value) === 'object' || valueType(value) === 'array'),
  );
</script>

{#if expandable}
  <button
    class="rs-toggle"
    data-expand
    aria-expanded={expanded}
    onclick={toggle}
    onkeydown={onToggleKey}>{expanded ? '▼' : '▶'} {formatValue(value)}</button
  >
  {#if expanded}
    {#if entries.length}
      <ul class="rs-children">
        {#each entries as [k, v], i (i)}
          <li>
            <span class="rs-key">{k}:</span>
            <Self
              value={v}
              editable={childrenEditable}
              path={[...path, childStep(value, k, i)]}
              {onEdit}
              {onInspect}
            />
          </li>
        {/each}
        {#if hiddenCount > 0}
          <li>
            <button class="rs-more" data-show-more onclick={() => (shown += ENTRY_LIMIT)}
              >… {hiddenCount} more</button
            >
          </li>
        {/if}
      </ul>
    {:else if isDehydratedValue(value)}
      <ul class="rs-children"><li class="rs-loading">…</li></ul>
    {/if}
  {/if}
{:else if longString}
  <span class="rs-str" title={formatValue(value)}
    >{truncateString(formatValue(value), STRING_LIMIT)}</span
  >
{:else if editable && typeof value === 'boolean'}
  <input
    type="checkbox"
    class="rs-leaf"
    data-edit-leaf
    checked={value}
    onchange={(e) => onEdit(path, e.currentTarget.checked)}
  />
{:else if editable && isEditableLeaf(value)}
  <input
    class="rs-leaf"
    data-edit-leaf
    value={formatValue(value)}
    oninput={(e) => onEdit(path, coerceInput(value, e.currentTarget.value))}
  />
{:else}{formatValue(value)}{/if}

<style>
  .rs-toggle {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-align: left;
    /* A button's baseline is its last line: a wrapped preview would pull its key down to it. */
    vertical-align: top;
  }
  .rs-children {
    list-style: none;
    margin: 0;
    padding: 0 0 0 12px;
  }
  .rs-key {
    color: var(--rs-key);
  }
  .rs-loading {
    color: var(--rs-muted-2);
  }
  .rs-more {
    background: transparent;
    border: none;
    color: var(--rs-accent);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .rs-more:hover {
    text-decoration: underline;
  }
  .rs-str {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .rs-leaf {
    width: 80px;
    background: var(--rs-bg-elev);
    color: var(--rs-string);
    border: 1px solid var(--rs-border);
    font: inherit;
  }
  .rs-leaf[type='checkbox'] {
    width: auto;
  }
</style>
