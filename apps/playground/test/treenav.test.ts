import { test, expect } from 'vitest';
import { visibleOrder, navigate, matchingNodeIds } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const n = (id: number, parent: number | null, children: number[]): SerializedNode => ({
  id,
  name: `N${id}`,
  parent,
  children,
  snippets: [],
  values: {},
  writable: [],
});

// App(1) ▸ Counter(2), Card(3) ▸ Field(4)
const nodes = [n(1, null, [2, 3]), n(2, 1, []), n(3, 1, [4]), n(4, 3, [])];

test('visibleOrder: pre-order DFS of the rendered tree', () => {
  expect(visibleOrder(nodes, null)).toEqual([1, 2, 3, 4]);
});

test('visibleOrder: a filter keeps only matches + ancestors, in order', () => {
  expect(visibleOrder(nodes, matchingNodeIds(nodes, 'N4'))).toEqual([1, 3, 4]); // Counter(2) filtered out
});

test('navigate: ArrowDown/Up move through the visible order and clamp at the ends', () => {
  expect(navigate(nodes, null, null, 'ArrowDown')).toEqual({ id: 1 }); // nothing selected → first
  expect(navigate(nodes, null, 1, 'ArrowDown')).toEqual({ id: 2 });
  expect(navigate(nodes, null, 4, 'ArrowDown')).toEqual({ id: 4 }); // clamp at last
  expect(navigate(nodes, null, 3, 'ArrowUp')).toEqual({ id: 2 });
  expect(navigate(nodes, null, 1, 'ArrowUp')).toEqual({ id: 1 }); // clamp at first
});

test('navigate: Home/End jump to the ends; Escape clears', () => {
  expect(navigate(nodes, null, 3, 'Home')).toEqual({ id: 1 });
  expect(navigate(nodes, null, 1, 'End')).toEqual({ id: 4 });
  expect(navigate(nodes, null, 2, 'Escape')).toEqual({ id: null });
});

test('navigate: ArrowRight/Left collapse-aware (React-style)', () => {
  // expanded node with children: → descends to first child, ← collapses it
  expect(navigate(nodes, null, 1, 'ArrowRight')).toEqual({ id: 2 }); // App expanded → first child
  expect(navigate(nodes, null, 1, 'ArrowLeft')).toEqual({ collapse: 1 }); // App expanded → collapse
  // collapsed node with children: → expands it, ← goes to parent (collapsed = no descent)
  expect(navigate(nodes, null, 1, 'ArrowRight', new Set([1]))).toEqual({ expand: 1 });
  expect(navigate(nodes, null, 3, 'ArrowLeft', new Set([3]))).toEqual({ id: 1 }); // Card collapsed → parent
  // leaf node: → no-op, ← goes to parent
  expect(navigate(nodes, null, 2, 'ArrowRight')).toBeNull(); // Counter leaf
  expect(navigate(nodes, null, 4, 'ArrowLeft')).toEqual({ id: 3 }); // Field → Card
});

test('visibleOrder: a collapsed subtree is skipped (its descendants are not navigable)', () => {
  expect(visibleOrder(nodes, null, new Set([3]))).toEqual([1, 2, 3]); // Card(3) collapsed → Field(4) gone
  // ArrowDown from the last visible row clamps (does not enter the collapsed subtree)
  expect(navigate(nodes, null, 3, 'ArrowDown', new Set([3]))).toEqual({ id: 3 });
});

test('navigate: Alt+ArrowDown/Up move between siblings only (same parent)', () => {
  // siblings of 2 are [2,3] (parent 1); 4 is Card's child, not a sibling of 2/3
  expect(navigate(nodes, null, 2, 'ArrowDown', new Set(), true)).toEqual({ id: 3 });
  expect(navigate(nodes, null, 3, 'ArrowUp', new Set(), true)).toEqual({ id: 2 });
  expect(navigate(nodes, null, 3, 'ArrowDown', new Set(), true)).toEqual({ id: 3 }); // clamp: no next sibling
  expect(navigate(nodes, null, 4, 'ArrowDown', new Set(), true)).toEqual({ id: 4 }); // only child → clamp
  // contrast: plain ArrowDown from 3 descends into the child (DFS order), not sibling-bounded
  expect(navigate(nodes, null, 3, 'ArrowDown')).toEqual({ id: 4 });
});

test('navigate: a filter constrains movement to visible nodes', () => {
  // visible order is [1,3,4]; down from App skips the filtered-out Counter(2)
  expect(navigate(nodes, matchingNodeIds(nodes, 'N4'), 1, 'ArrowDown')).toEqual({ id: 3 });
});

test('navigate: unhandled keys return null (let the event through)', () => {
  expect(navigate(nodes, null, 1, 'a')).toBeNull();
});
