import { test, expect } from 'vitest';
import { treeView, visibleOrder, type TreeView } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

// What the tree shows, decided once for both of its forms: the nested tree the overlay renders and
// the flat, virtualized rows of the panel. No DOM.

const n = (
  id: number,
  name: string,
  parent: number | null,
  children: number[],
  extra: Partial<SerializedNode> = {},
): SerializedNode => ({
  id,
  name,
  parent,
  children,
  snippets: [],
  values: {},
  writable: [],
  ...extra,
});

// App(1) ▸ Layout(2) ▸ Counter(3), Card(4) ▸ Field(5)
const nodes = [
  n(1, 'App', null, [2]),
  n(2, 'Layout', 1, [3, 4], { loc: '/project/src/lib/Layout.svelte' }),
  n(3, 'Counter', 2, [], { values: { count: 1 } }),
  n(4, 'Card', 2, [5]),
  n(5, 'Field', 4, [], { values: { text: 'a' } }),
];
const names = (view: TreeView, ids: number[]) => ids.map((id) => view.byId.get(id)!.name);

// The nested tree walks roots and children through isVisible and isExpanded; the flat rows are the
// same walk, precomputed. They must list the same nodes in the same order.
function nestedOrder(view: TreeView): number[] {
  const out: number[] = [];
  const walk = (node: SerializedNode): void => {
    out.push(node.id);
    if (!view.isExpanded(node.id)) return;
    for (const id of node.children) {
      const child = view.byId.get(id);
      if (child && view.isVisible(id)) walk(child);
    }
  };
  view.roots.forEach(walk);
  return out;
}

test('with no filter, everything shows and only what is collapsed is closed', () => {
  const view = treeView(nodes, { collapsed: new Set([4]) });

  expect(names(view, nestedOrder(view))).toEqual(['App', 'Layout', 'Counter', 'Card']);
  expect(nestedOrder(view)).toEqual(visibleOrder(view.nodes, view.visibleIds, new Set([4])));
});

test('a query keeps the matches and their ancestors, and opens what is collapsed', () => {
  const collapsed = new Set([2, 4]);
  const view = treeView(nodes, { query: 'field', collapsed });

  expect(names(view, nestedOrder(view))).toEqual(['App', 'Layout', 'Card', 'Field']);
  expect(nestedOrder(view)).toEqual(visibleOrder(view.nodes, view.visibleIds, collapsed));
});

test('only stateful keeps the components with values, and their ancestors', () => {
  const view = treeView(nodes, { onlyStateful: true });

  expect(names(view, nestedOrder(view))).toEqual(['App', 'Layout', 'Counter', 'Card', 'Field']);
  expect(view.isVisible(3) && view.isVisible(5)).toBe(true);
  expect(
    treeView([n(1, 'App', null, [2]), n(2, 'Empty', 1, [])], { onlyStateful: true }).roots,
  ).toEqual([]);
});

test('excluded components are hidden and their children move up, matched by name or file', () => {
  expect(
    names(
      treeView(nodes, { exclude: 'layout' }),
      nestedOrder(treeView(nodes, { exclude: 'layout' })),
    ),
  ).toEqual(['App', 'Counter', 'Card', 'Field']);
  const byFile = treeView(nodes, { exclude: ' /lib/ , nothing ' });
  expect(byFile.byId.has(2)).toBe(false);
  expect(byFile.byId.get(3)!.parent).toBe(1);
});

test('an excluded root leaves its children as roots', () => {
  const view = treeView(nodes, { exclude: 'App' });

  expect(
    names(
      view,
      view.roots.map((r) => r.id),
    ),
  ).toEqual(['Layout']);
});

test('an empty exclude list hides nothing', () => {
  expect(treeView(nodes, { exclude: ' , ' }).nodes).toBe(nodes);
});

// Exclusion comes first: an excluded match is no match, so it keeps no ancestor in view.
test('a query that matches only excluded components shows nothing', () => {
  expect(treeView(nodes, { query: 'layout', exclude: 'layout' }).roots).toEqual([]);
});
