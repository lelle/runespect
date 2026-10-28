import { indexById, isRoot, type SerializedNode } from '@runespect/agent/protocol/internal';
import { excludeNodes, visibleNodeIds } from './search';

// Keyboard navigation for the names-only tree. Pure (no DOM) so the movement rules are unit-
// testable: the component maps a keydown to navigate() and applies the result via onSelect (or by
// toggling collapse). Takes the precomputed visible-id set (null = all) and the collapsed-id set
// so nav matches exactly what the tree renders. While a filter is active (visibleIds != null)
// collapse is ignored — the filtered path is force-expanded so matches stay reachable.

const expandedFor = (
  id: number,
  visibleIds: Set<number> | null,
  collapsed: ReadonlySet<number>,
): boolean => visibleIds != null || !collapsed.has(id);

export interface TreeViewOptions {
  /** The search query (a regex between slashes, else a substring). */
  query?: string;
  /** Show only components that report values, with their ancestors. */
  onlyStateful?: boolean;
  /** Comma-separated name or file fragments to hide; their children move up to the nearest kept parent. */
  exclude?: string;
  collapsed?: ReadonlySet<number>;
}

/** What the tree shows: the same answer for the nested tree and for the flat rows. */
export interface TreeView {
  /** The nodes after exclusion. */
  nodes: SerializedNode[];
  byId: Map<number, SerializedNode>;
  /** The nodes a filter keeps, with their ancestors; null when nothing filters. */
  visibleIds: Set<number> | null;
  roots: SerializedNode[];
  isVisible(id: number): boolean;
  /** A filter opens every kept node, so the path to a match is never hidden by a collapse. */
  isExpanded(id: number): boolean;
}

// Exclusion comes first, and the filters then apply to the tree it re-parented.
export function treeView(nodes: SerializedNode[], options: TreeViewOptions = {}): TreeView {
  const { query = '', onlyStateful = false, exclude = '', collapsed = new Set<number>() } = options;
  const patterns = exclude
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const kept = patterns.length
    ? excludeNodes(nodes, (n) =>
        patterns.some(
          (p) => n.name.toLowerCase().includes(p) || (n.loc?.toLowerCase().includes(p) ?? false),
        ),
      )
    : nodes;
  const byId = indexById(kept);
  const visibleIds = visibleNodeIds(kept, { query, onlyStateful });
  const isVisible = (id: number): boolean => !visibleIds || visibleIds.has(id);
  return {
    nodes: kept,
    byId,
    visibleIds,
    roots: kept.filter((n) => isRoot(n, byId) && isVisible(n.id)),
    isVisible,
    isExpanded: (id) => expandedFor(id, visibleIds, collapsed),
  };
}

/** A rendered tree row: the node id, its nesting depth (0 = root), and its place among its visible
 * siblings (1-based), which the row announces as aria-posinset / aria-setsize. */
export interface TreeRow {
  id: number;
  depth: number;
  posinset: number;
  setsize: number;
}

// The visible rows in render order: a pre-order DFS of roots → children, not descending into
// collapsed subtrees. Mirrors <Tree>'s roots/isVisible/expanded logic, and is what the virtualized
// names-only tree renders a window of.
export function visibleRows(
  nodes: SerializedNode[],
  visibleIds: Set<number> | null,
  collapsed: Set<number> = new Set(),
): TreeRow[] {
  const byId = indexById(nodes);
  const isVisible = (id: number): boolean => !visibleIds || visibleIds.has(id);
  const rows: TreeRow[] = [];
  const walkAll = (siblings: SerializedNode[], depth: number): void => {
    siblings.forEach((node, i) => {
      rows.push({ id: node.id, depth, posinset: i + 1, setsize: siblings.length });
      if (!expandedFor(node.id, visibleIds, collapsed)) return; // collapsed → subtree not rendered
      const children = node.children
        .map((childId) => byId.get(childId))
        .filter((child): child is SerializedNode => !!child && isVisible(child.id));
      walkAll(children, depth + 1);
    });
  };
  walkAll(
    nodes.filter((n) => isRoot(n, byId) && isVisible(n.id)),
    0,
  );
  return rows;
}

// Just the ids of visibleRows — the movement order behind keyboard navigation.
export function visibleOrder(
  nodes: SerializedNode[],
  visibleIds: Set<number> | null,
  collapsed: Set<number> = new Set(),
): number[] {
  return visibleRows(nodes, visibleIds, collapsed).map((r) => r.id);
}

// null = key not handled (pass the event through). { id } moves selection (id null = clear, Escape).
// { collapse } / { expand } toggle a node's collapse state instead of moving.
export type NavResult = { id: number | null } | { collapse: number } | { expand: number } | null;

export function navigate(
  nodes: SerializedNode[],
  visibleIds: Set<number> | null,
  current: number | null,
  key: string,
  collapsed: Set<number> = new Set(),
  alt = false,
): NavResult {
  if (key === 'Escape') return { id: null };
  const order = visibleOrder(nodes, visibleIds, collapsed);
  if (!order.length) return null;
  const idx = current == null ? -1 : order.indexOf(current);
  const at = (i: number): NavResult => ({ id: order[Math.max(0, Math.min(i, order.length - 1))] });

  const filtering = visibleIds != null;
  const byId = indexById(nodes);
  const node = current == null ? undefined : byId.get(current);
  const isExpanded = (id: number): boolean => expandedFor(id, visibleIds, collapsed);

  // Alt+↑/↓: move within the current node's siblings only (same parent), in visible order. Clamps
  // at the first/last sibling rather than crossing into another parent's subtree.
  if (alt && (key === 'ArrowDown' || key === 'ArrowUp')) {
    if (!node) return at(0);
    const sibs = order.filter((id) => byId.get(id)?.parent === node.parent);
    const si = sibs.indexOf(current as number);
    const j = key === 'ArrowDown' ? Math.min(si + 1, sibs.length - 1) : Math.max(si - 1, 0);
    return { id: sibs[j] };
  }

  switch (key) {
    case 'ArrowDown':
      return at(idx + 1);
    case 'ArrowUp':
      return at(idx <= 0 ? 0 : idx - 1);
    case 'Home':
      return at(0);
    case 'End':
      return at(order.length - 1);
    case 'ArrowRight': {
      if (!node) return null;
      // collapsed node with children → expand it; otherwise descend to the first visible child
      if (!filtering && node.children.length && !isExpanded(node.id)) return { expand: node.id };
      const firstChild = node.children.find((c) => order.includes(c));
      return firstChild != null ? { id: firstChild } : null;
    }
    case 'ArrowLeft': {
      if (!node) return null;
      // expanded node with children → collapse it; otherwise go to the parent
      if (!filtering && node.children.length && isExpanded(node.id)) return { collapse: node.id };
      return node.parent != null && order.includes(node.parent) ? { id: node.parent } : null;
    }
    default:
      return null;
  }
}
