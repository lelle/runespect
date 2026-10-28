import { test, expect } from 'vitest';
import {
  windowRange,
  visibleRows,
  scrollTopForRow,
  matchingNodeIds,
  ROW_HEIGHT,
  OVERSCAN,
} from '@runespect/ui/internal';
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

// N1 ▸ N2, N3 ▸ N4
const nodes = [n(1, null, [2, 3]), n(2, 1, []), n(3, 1, [4]), n(4, 3, [])];

test('visibleRows: pre-order DFS with the nesting depth of each row', () => {
  expect(visibleRows(nodes, null)).toMatchObject([
    { id: 1, depth: 0 },
    { id: 2, depth: 1 },
    { id: 3, depth: 1 },
    { id: 4, depth: 2 },
  ]);
});

// A screen reader announces "2 of 3": each row says where it sits among its visible siblings, worked
// out in the same walk instead of once per rendered row.
test('visibleRows: each row knows its position among its visible siblings', () => {
  expect(visibleRows(nodes, null).map((r) => [r.id, r.posinset, r.setsize])).toEqual([
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 2],
    [4, 1, 1],
  ]);
  const filtered = visibleRows(nodes, matchingNodeIds(nodes, 'N4'));
  expect(filtered.map((r) => [r.id, r.posinset, r.setsize])).toEqual([
    [1, 1, 1],
    [3, 1, 1],
    [4, 1, 1],
  ]);
});

test('visibleRows: collapsed subtrees drop out; a filter keeps matches + ancestors', () => {
  expect(visibleRows(nodes, null, new Set([3]))).toMatchObject([
    { id: 1, depth: 0 },
    { id: 2, depth: 1 },
    { id: 3, depth: 1 },
  ]);
  expect(visibleRows(nodes, matchingNodeIds(nodes, 'N4'))).toMatchObject([
    { id: 1, depth: 0 },
    { id: 3, depth: 1 },
    { id: 4, depth: 2 },
  ]);
});

test('windowRange: renders only the rows in the viewport, plus overscan', () => {
  const w = windowRange(1000, 0, 200, 20, 2);
  expect(w.start).toBe(0);
  expect(w.end).toBe(12); // 10 visible rows + 2 overscan
  expect(w.padTop).toBe(0);
  expect(w.padBottom).toBe((1000 - 12) * 20);
});

test('windowRange: scrolling moves the window and the spacers keep total height stable', () => {
  const w = windowRange(1000, 400, 200, 20, 2);
  expect(w.start).toBe(18); // floor(400/20) - 2
  expect(w.end).toBe(32); // ceil(600/20) + 2
  expect(w.padTop).toBe(18 * 20);
  expect(w.padTop + (w.end - w.start) * 20 + w.padBottom).toBe(1000 * 20);
});

test('windowRange: clamps at both ends', () => {
  const top = windowRange(1000, -50, 200, 20, 2);
  expect(top.start).toBe(0);
  expect(top.padTop).toBe(0);

  const bottom = windowRange(50, 10_000, 200, 20, 2);
  expect(bottom.end).toBe(50);
  expect(bottom.padBottom).toBe(0);
  expect(bottom.start).toBeLessThanOrEqual(50);
});

test('windowRange: an unmeasured viewport renders every row (no windowing)', () => {
  const w = windowRange(1000, 0, 0, 20, 2); // jsdom / not yet laid out
  expect(w).toEqual({ start: 0, end: 1000, padTop: 0, padBottom: 0 });
});

test('windowRange: defaults come from the shared row-height/overscan constants', () => {
  expect(windowRange(500, 0, ROW_HEIGHT * 10)).toEqual(
    windowRange(500, 0, ROW_HEIGHT * 10, ROW_HEIGHT, OVERSCAN),
  );
});

test('scrollTopForRow: null while the row is already inside the viewport', () => {
  expect(scrollTopForRow(5, 0, 200, 20)).toBeNull(); // rows 0..9 visible
  expect(scrollTopForRow(0, 0, 200, 20)).toBeNull();
  expect(scrollTopForRow(9, 0, 200, 20)).toBeNull();
});

test('scrollTopForRow: scrolls the minimum distance to reveal a row above or below', () => {
  expect(scrollTopForRow(30, 0, 200, 20)).toBe(20 * 31 - 200); // just into view at the bottom
  expect(scrollTopForRow(2, 400, 200, 20)).toBe(40); // above the viewport → row at the top
});

test('scrollTopForRow: an unmeasured viewport never scrolls', () => {
  expect(scrollTopForRow(500, 0, 0, 20)).toBeNull();
});
