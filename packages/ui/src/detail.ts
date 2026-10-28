import type { SerializedNode } from '@runespect/agent/protocol/internal';

// Grouping logic for the detail pane: bucket a node's value symbols by their build-time
// category (kinds), in a stable display order. Pure so it can be unit-tested without
// mounting the component.

export interface DetailGroup {
  kind: string;
  label: string;
  symbols: string[];
}

// Display order + human label per kind. props lead (as in React DevTools), then the reactive state,
// then read-only views, stores, class.
const ORDER: { kind: string; label: string }[] = [
  { kind: 'prop', label: 'props' },
  { kind: 'state', label: 'state' },
  { kind: 'derived', label: 'derived' },
  { kind: 'store', label: 'stores' },
  { kind: 'class', label: 'class fields' },
  { kind: 'context', label: 'context' },
  { kind: 'context-set', label: 'context (set)' },
  { kind: 'other', label: 'other' },
];

export function detailGroups(node: SerializedNode): DetailGroup[] {
  const kinds = node.kinds ?? {};
  const buckets = new Map<string, string[]>();
  for (const sym of Object.keys(node.values)) {
    const kind = kinds[sym] ?? 'other';
    let symbols = buckets.get(kind);
    if (!symbols) buckets.set(kind, (symbols = []));
    symbols.push(sym);
  }
  const groups: DetailGroup[] = [];
  for (const { kind, label } of ORDER) {
    const symbols = buckets.get(kind);
    if (symbols?.length) groups.push({ kind, label, symbols });
  }
  // Any future kind not in ORDER is appended under its own name rather than dropped.
  for (const [kind, symbols] of buckets) {
    if (symbols.length && !ORDER.some((o) => o.kind === kind)) {
      groups.push({ kind, label: kind, symbols });
    }
  }
  return groups;
}

// Coerce an edited input string back to the original value's primitive type so an edit
// round-trips (number stays number, boolean stays boolean). A blank field keeps the original
// for number/boolean — otherwise Number('') === 0 / 'true' !== '' would silently overwrite
// the value the moment the user clears the input to retype. Strings pass through verbatim, so
// a string can still be cleared to ''. NaN keeps the original.
export function coerceInput(original: unknown, raw: string): unknown {
  if (typeof original === 'number') {
    if (raw.trim() === '') return original;
    const n = Number(raw);
    return Number.isNaN(n) ? original : n;
  }
  if (typeof original === 'boolean') {
    if (raw.trim() === '') return original;
    return raw === 'true';
  }
  return raw;
}
