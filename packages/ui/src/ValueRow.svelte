<svelte:options css="injected" />

<script lang="ts">
  import type { SerializedNode } from '@runespect/agent/protocol/internal';
  import { formatValue, valueType, isExpandable, isEditableLeaf } from './valueView';
  import { coerceInput } from './detail';
  import ValueView from './ValueView.svelte';

  // The value cell of one symbol row, shared by <Tree> (overlay) and <Detail> (panel) so the
  // three-way logic (writable object/array → editable drill-in · writable primitive → input ·
  // read-only → ValueView) and its edit/inspect wiring live in ONE place. The two surfaces differ
  // only in test-id names, passed as editAttr/valueAttr; styling is self-contained here.
  let {
    node,
    sym,
    val,
    flashing = false,
    flashAgain = false,
    defaultExpanded = false,
    onEdit = () => {},
    onInspect = () => {},
    editAttr,
    valueAttr,
  }: {
    node: SerializedNode;
    sym: string;
    val: unknown;
    flashing?: boolean;
    /** Which of two identical animations to run: a change mid-blink starts it over. */
    flashAgain?: boolean;
    defaultExpanded?: boolean;
    onEdit?: (id: number, symbol: string, path: (string | number)[], value: unknown) => void;
    onInspect?: (id: number, symbol: string, path: (string | number)[], limit?: number) => void;
    /** data-* attribute name for the editable cell (e.g. "data-edit" / "data-detail-edit"). */
    editAttr: string;
    /** data-* attribute name for the read-only cell (e.g. "data-value" / "data-detail-value"). */
    valueAttr: string;
  } = $props();

  let id = $derived(`${node.name}.${sym}`);
  let writable = $derived(node.writable.includes(sym));
</script>

{#if writable && isExpandable(val)}
  <!-- writable object/array: drill in and edit leaves (no lossy string input) -->
  <span
    class="rs-value"
    class:rs-flash={flashing}
    class:rs-flash-again={flashAgain}
    {...{ [editAttr]: id, 'data-type': valueType(val) }}
  >
    <ValueView
      value={val}
      editable
      {defaultExpanded}
      onEdit={(p, v) => onEdit(node.id, sym, p, v)}
      onInspect={(p, limit) => onInspect(node.id, sym, p, limit)}
    />
  </span>
{:else if writable && typeof val === 'boolean'}
  <input
    type="checkbox"
    class="rs-edit"
    class:rs-flash={flashing}
    class:rs-flash-again={flashAgain}
    {...{ [editAttr]: id }}
    checked={val}
    onchange={(e) => onEdit(node.id, sym, [], e.currentTarget.checked)}
  />
{:else if writable && isEditableLeaf(val)}
  <input
    class="rs-edit"
    class:rs-flash={flashing}
    class:rs-flash-again={flashAgain}
    {...{ [editAttr]: id }}
    value={formatValue(val)}
    oninput={(e) => onEdit(node.id, sym, [], coerceInput(val, e.currentTarget.value))}
  />
{:else}
  <span
    class="rs-value"
    class:rs-flash={flashing}
    class:rs-flash-again={flashAgain}
    {...{ [valueAttr]: id, 'data-type': valueType(val) }}
    ><ValueView
      value={val}
      {defaultExpanded}
      onInspect={(p, limit) => onInspect(node.id, sym, p, limit)}
    /></span
  >
{/if}

<style>
  .rs-value {
    color: var(--rs-string);
  }
  .rs-edit {
    width: 80px;
    background: var(--rs-bg-elev);
    color: var(--rs-string);
    border: 1px solid var(--rs-border);
  }
  .rs-edit[type='checkbox'] {
    width: auto;
  }
  .rs-flash {
    animation: rs-flash 0.7s ease-out;
    border-radius: var(--rs-mark-radius);
  }
  .rs-value.rs-flash {
    margin: 0 calc(-1 * var(--rs-mark-pad));
    padding: var(--rs-mark-pad-block) var(--rs-mark-pad);
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
