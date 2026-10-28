import { test, expect } from 'vitest';
import { commitFromOps, indexById } from '@runespect/agent/protocol/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const node = (id: number, name: string, values: Record<string, unknown>): SerializedNode => ({
  id,
  name,
  parent: null,
  children: [],
  snippets: [],
  values,
  writable: Object.keys(values),
});

const prevOf = (...nodes: SerializedNode[]) => indexById(nodes);

test('an update records only the symbols that actually changed, with before and after', () => {
  const prev = prevOf(node(3, 'Counter', { count: 3, doubled: 6, start: 1 }));
  const commit = commitFromOps(
    prev,
    [{ op: 'update', node: node(3, 'Counter', { count: 4, doubled: 8, start: 1 }) }],
    142,
    1000,
  );

  expect(commit).toMatchObject({ seq: 142, t: 1000 });
  expect(commit.changes).toEqual([
    { op: 'update', id: 3, name: 'Counter', symbol: 'count', from: 3, to: 4 },
    { op: 'update', id: 3, name: 'Counter', symbol: 'doubled', from: 6, to: 8 },
  ]);
});

test('a value that did not change is not recorded — history is what happened, not what exists', () => {
  const prev = prevOf(node(3, 'Counter', { count: 3, start: 1 }));
  const commit = commitFromOps(
    prev,
    [{ op: 'update', node: node(3, 'Counter', { count: 3, start: 1 }) }],
    1,
    0,
  );

  expect(commit.changes).toEqual([]);
});

test('mounting and unmounting a component are changes too', () => {
  const prev = prevOf(node(3, 'Counter', { count: 1 }));
  const commit = commitFromOps(
    prev,
    [
      { op: 'add', node: node(21, 'Toast', { open: true }) },
      { op: 'remove', id: 3 },
    ],
    2,
    0,
  );

  expect(commit.changes).toEqual([
    { op: 'add', id: 21, name: 'Toast' },
    { op: 'remove', id: 3, name: 'Counter' },
  ]);
});

test('a symbol that appears or disappears is recorded as a change', () => {
  const prev = prevOf(node(3, 'Counter', { count: 3 }));
  const commit = commitFromOps(
    prev,
    [{ op: 'update', node: node(3, 'Counter', { count: 3, error: 'boom' }) }],
    3,
    0,
  );

  expect(commit.changes).toEqual([
    { op: 'update', id: 3, name: 'Counter', symbol: 'error', from: undefined, to: 'boom' },
  ]);
});

test('an object value is compared by content, not identity — a rebuilt but equal object is not a change', () => {
  const prev = prevOf(node(9, 'Cart', { lines: [{ id: 1 }] }));
  const commit = commitFromOps(
    prev,
    [{ op: 'update', node: node(9, 'Cart', { lines: [{ id: 1 }] }) }],
    4,
    0,
  );

  expect(commit.changes).toEqual([]);
});
