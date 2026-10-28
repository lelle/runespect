import { test, expect } from 'vitest';
import {
  diffOps,
  applyOps,
  indexById,
  type SerializedNode,
} from '@runespect/agent/protocol/internal';

const node = (id: number, name: string, values: Record<string, unknown> = {}): SerializedNode => ({
  id,
  name,
  parent: null,
  children: [],
  values,
  snippets: [],
  writable: [],
});

const sorted = (ns: SerializedNode[]) => [...ns].sort((a, b) => a.id - b.id);

test('diffOps: no change → no ops', () => {
  const cur = [node(1, 'A')];
  expect(diffOps(indexById(cur), cur)).toEqual([]);
});

test('diffOps: detects add, update and remove', () => {
  const prev = indexById([node(1, 'A', { x: 1 }), node(2, 'B')]);
  const cur = [node(1, 'A', { x: 2 }), node(3, 'C')];
  const ops = diffOps(prev, cur);
  expect(ops).toContainEqual({ op: 'remove', id: 2 });
  expect(ops).toContainEqual({ op: 'update', node: node(1, 'A', { x: 2 }) });
  expect(ops).toContainEqual({ op: 'add', node: node(3, 'C') });
});

test('applyOps: upserts and removes by id', () => {
  const start = [node(1, 'A'), node(2, 'B')];
  const next = applyOps(start, [
    { op: 'remove', id: 2 },
    { op: 'update', node: node(1, 'A', { x: 9 }) },
    { op: 'add', node: node(3, 'C') },
  ]);
  expect(sorted(next)).toEqual(sorted([node(1, 'A', { x: 9 }), node(3, 'C')]));
});

test('round-trip invariant: applyOps(prev, diffOps(prev, cur)) === cur', () => {
  const prev = [node(1, 'App', { t: 'x' }), node(2, 'Counter', { count: 1 }), node(3, 'Old')];
  const cur = [
    node(1, 'App', { t: 'y' }), // updated
    node(2, 'Counter', { count: 1 }), // unchanged
    node(4, 'New', { a: 1 }), // added; node 3 removed
  ];
  const rebuilt = applyOps(prev, diffOps(indexById(prev), cur));
  expect(sorted(rebuilt)).toEqual(sorted(cur));
});

test('round-trip invariant: an empty diff leaves the list unchanged', () => {
  const cur = [node(1, 'A', { x: 1 })];
  expect(sorted(applyOps(cur, diffOps(indexById(cur), cur)))).toEqual(sorted(cur));
});
