import { test, expect } from 'vitest';
import { EMPTY, hold, shown, type Held, type HeldEvent } from '@runespect/ui/internal';
import type { Commit, SerializedNode } from '@runespect/agent/protocol/internal';

// The tree the panel holds, as a sequence: what the page sent, what the user expanded, and the
// replies. No DOM and no Svelte.

const marker = (preview = '{ a } (1)') => ({
  __runespect: 'dehydrated',
  type: 'object',
  preview,
  size: 1,
});
const node = (id: number, values: Record<string, unknown>, name = 'App'): SerializedNode => ({
  id,
  name,
  parent: null,
  children: [],
  snippets: [],
  values,
  writable: [],
});
const update = (n: SerializedNode, commit = 1): HeldEvent => ({
  type: 'ops',
  ops: [{ op: 'update', node: n }],
  commit,
  t: 0,
});

function play(...events: HeldEvent[]) {
  let held: Held = EMPTY;
  const commits: Commit[] = [];
  for (const e of events) {
    const step = hold(held, e);
    held = step.state;
    if (step.commit) commits.push(step.commit);
  }
  return { held, commits, values: (id = 1) => shown(held).find((n) => n.id === id)?.values };
}

// A fetched value must not be compared against the next fresh marker.
test('an update records only what the page changed, not what the panel fetched', () => {
  const { commits, values } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker(), n: 1 })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
    update(node(1, { cfg: marker(), n: 2 })),
  );

  expect(commits.map((c) => c.changes.map((ch) => `${ch.name}.${ch.symbol}`))).toEqual([['App.n']]);
  expect(values()).toEqual({ cfg: marker(), n: 2 }); // the marker is back, and ValueView asks again
});

test('a reply shows in the tree, and not in what the page sent', () => {
  const { held, values } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
  );

  expect(values()).toEqual({ cfg: { a: 1 } });
  expect(held.sent[0].values).toEqual({ cfg: marker() });
});

test('an update without a commit number records nothing', () => {
  const step = hold(play({ type: 'tree', nodes: [node(1, { n: 1 })] }).held, {
    type: 'ops',
    ops: [{ op: 'update', node: node(1, { n: 2 }) }],
    t: 0,
  });

  expect(step.commit).toBeNull();
  expect(step.state.sent[0].values).toEqual({ n: 2 });
});

test('asking again is one fetch, and the larger number of entries wins', () => {
  const { held } = play(
    { type: 'tree', nodes: [node(1, { list: marker() })] },
    { type: 'asked', id: 1, path: ['list'], limit: 200 },
    { type: 'asked', id: 1, path: ['list'] },
    { type: 'asked', id: 1, path: ['list'], limit: 100 },
  );

  expect(held.fetched).toEqual([{ id: 1, path: ['list'], limit: 200 }]);
});

test('a reply nobody asked for, or for a node that is gone, changes nothing', () => {
  const { held, values } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() }), node(2, { x: marker() })] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
    { type: 'asked', id: 2, path: ['x'] },
    { type: 'ops', ops: [{ op: 'remove', id: 2 }], t: 0 },
    { type: 'hydrate', id: 2, path: ['x'], value: { b: 1 } },
  );

  expect(values()).toEqual({ cfg: marker() });
  expect(held.fetched).toEqual([]);
});

test('a value expanded inside a fetched one lands inside it', () => {
  const { values } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { inner: marker(), a: 1 } },
    { type: 'asked', id: 1, path: ['cfg', 'inner'] },
    { type: 'hydrate', id: 1, path: ['cfg', 'inner'], value: { deep: true } },
  );

  expect(values()).toEqual({ cfg: { inner: { deep: true }, a: 1 } });
});

test('an update drops the replies for that node only, and a new tree drops them all', () => {
  const start: HeldEvent[] = [
    { type: 'tree', nodes: [node(1, { cfg: marker() }), node(2, { cfg: marker() }, 'Row')] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
    { type: 'asked', id: 2, path: ['cfg'] },
    { type: 'hydrate', id: 2, path: ['cfg'], value: { a: 2 } },
  ];

  const updated = play(...start, update(node(1, { cfg: marker() })));
  expect([updated.values(1), updated.values(2)]).toEqual([{ cfg: marker() }, { cfg: { a: 2 } }]);

  const replaced = play(...start, {
    type: 'tree',
    nodes: [node(1, { cfg: marker() }), node(2, { cfg: marker() }, 'Row')],
  });
  expect([replaced.values(1), replaced.values(2)]).toEqual([{ cfg: marker() }, { cfg: marker() }]);
});

test('a new tree forgets what was expanded in a node it no longer has', () => {
  const { held } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() }), node(2, { cfg: marker() })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'asked', id: 2, path: ['cfg'] },
    { type: 'tree', nodes: [node(2, { cfg: marker() })] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
  );

  expect(held.fetched).toEqual([{ id: 2, path: ['cfg'] }]);
});

test('the reply that comes after an update shows again', () => {
  const { values } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
    update(node(1, { cfg: marker() })),
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 2 } },
  );

  expect(values()).toEqual({ cfg: { a: 2 } });
});

// The overlay runs in the page, so it reads every expanded value afresh instead of keeping replies.
test('with a reader, every expanded value is read afresh and stored replies are ignored', () => {
  const reads: unknown[] = [];
  const { held } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker(), list: marker() })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: 'stored' },
    { type: 'asked', id: 1, path: ['list'], limit: 200 },
  );

  const values = shown(held, (id, path, limit) => {
    reads.push([id, path, limit]);
    return `read ${path.join('.')}`;
  })[0].values;

  expect(values).toEqual({ cfg: 'read cfg', list: 'read list' });
  expect(reads).toEqual([
    [1, ['cfg'], undefined],
    [1, ['list'], 200],
  ]);
});

test('a node with nothing expanded is passed through as it was sent', () => {
  const { held } = play(
    { type: 'tree', nodes: [node(1, { cfg: marker() }), node(2, { n: 1 })] },
    { type: 'asked', id: 1, path: ['cfg'] },
    { type: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } },
  );

  expect(shown(held)[1]).toBe(held.sent[1]);
});
