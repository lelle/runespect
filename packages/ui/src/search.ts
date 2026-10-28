import { compileMatcher, indexById, type SerializedNode } from '@runespect/agent/protocol/internal';

export { compileMatcher } from '@runespect/agent/protocol/internal';

// Keep every node matching `predicate`, plus each match's ancestors so the tree path stays
// visible. The shared core behind search and the component filters.
function keepWithAncestors(
  nodes: SerializedNode[],
  predicate: (n: SerializedNode) => boolean,
): Set<number> {
  const byId = indexById(nodes);
  const visible = new Set<number>();
  for (const n of nodes) {
    if (!predicate(n)) continue;
    let cur: SerializedNode | undefined = n;
    while (cur && !visible.has(cur.id)) {
      visible.add(cur.id);
      cur = cur.parent != null ? byId.get(cur.parent) : undefined;
    }
  }
  return visible;
}

// The direct name matches for a query, in node order — the cycle list behind Enter/Shift+Enter and
// the "n of m" counter. Excludes the ancestors that matchingNodeIds adds for tree visibility.
export function searchMatches(
  nodes: SerializedNode[],
  query: string,
): { ids: number[]; error: boolean } {
  const m = compileMatcher(query);
  if (!m) return { ids: [], error: false };
  return { ids: nodes.filter((n) => m.test(n.name)).map((n) => n.id), error: m.error };
}

// Which node ids to show for a search query: name matches + ancestors. Returns null for an empty
// query ("no filter — show everything"), which the tree treats as the default.
export function matchingNodeIds(nodes: SerializedNode[], query: string): Set<number> | null {
  const m = compileMatcher(query);
  if (!m) return null;
  return keepWithAncestors(nodes, (n) => m.test(n.name));
}

// Remove nodes matching `isExcluded` while keeping their descendants: each kept node re-parents to
// its nearest non-excluded ancestor (so hiding a wrapper promotes its children rather than dropping
// them). Returns a new node list with rebuilt parent/children; ids are unchanged.
export function excludeNodes(
  nodes: SerializedNode[],
  isExcluded: (n: SerializedNode) => boolean,
): SerializedNode[] {
  const byId = indexById(nodes);
  const nearestKeptParent = (n: SerializedNode): number | null => {
    let pid = n.parent;
    while (pid != null) {
      const p = byId.get(pid);
      if (!p) return null;
      if (!isExcluded(p)) return pid;
      pid = p.parent;
    }
    return null;
  };
  const result = nodes
    .filter((n) => !isExcluded(n))
    .map((n) => ({ ...n, parent: nearestKeptParent(n), children: [] as number[] }));
  const resById = indexById(result);
  for (const n of result) {
    if (n.parent != null) resById.get(n.parent)?.children.push(n.id);
  }
  return result;
}

export interface TreeFilters {
  query?: string;
  /** Hide components with no reactive values (their stateful descendants + ancestors stay). */
  onlyStateful?: boolean;
}

// Combined visibility for search + the component filters. A node is a direct match when it passes
// every active filter; matches and their ancestors are visible. null = no active filter (show all).
export function visibleNodeIds(nodes: SerializedNode[], filters: TreeFilters): Set<number> | null {
  const m = compileMatcher(filters.query ?? '');
  const onlyStateful = !!filters.onlyStateful;
  if (!m && !onlyStateful) return null;
  return keepWithAncestors(
    nodes,
    (n) => (!m || m.test(n.name)) && (!onlyStateful || Object.keys(n.values).length > 0),
  );
}
