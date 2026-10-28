import { test, expect, vi, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const n = (
  id: number,
  parent: number | null,
  children: number[],
  name: string,
): SerializedNode => ({
  id,
  name,
  parent,
  children,
  snippets: [],
  values: {},
  writable: [],
});
// App(1) ▸ Counter(2), Card(3)
const tree: SerializedNode[] = [
  n(1, null, [2, 3], 'App'),
  n(2, 1, [], 'Counter'),
  n(3, 1, [], 'Card'),
];

const orig = Element.prototype.scrollIntoView;
afterEach(() => {
  Element.prototype.scrollIntoView = orig;
});

function mountTree(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes: tree, ...props } });
  flushSync();
  return target;
}

test('selecting a node scrolls its row into view (keyboard/picker)', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const target = mountTree({ namesOnly: true, selectedId: 2 });

  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll.mock.instances[0]).toBe(target.querySelector('.rs-selected > .name')); // the Counter row
});

test('no selection → nothing is scrolled', () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  mountTree({ namesOnly: true, selectedId: null });

  expect(scroll).not.toHaveBeenCalled();
});
