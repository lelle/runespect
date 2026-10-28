import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree } from '@runespect/ui/internal';
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
// App(1) ▸ Counter(2)
const tree: SerializedNode[] = [
  { ...n(1, null, [2]), name: 'App' },
  { ...n(2, 1, []), name: 'Counter' },
];

function mountTree(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes: tree, ...props } });
  flushSync();
  return target;
}

test('clicking the chevron collapses and re-expands a subtree', () => {
  const target = mountTree({});
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy();

  const twirl = target.querySelector('[data-collapse="App"]') as HTMLButtonElement;
  expect(twirl).toBeTruthy();
  twirl.click();
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeNull(); // collapsed

  twirl.click();
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // re-expanded
});

test('a leaf node renders a spacer, not a chevron', () => {
  const target = mountTree({});
  const counter = target.querySelector('[data-component="Counter"]') as HTMLElement;
  expect(counter.querySelector('[data-collapse]')).toBeNull();
  expect(counter.querySelector('.twirl-spacer')).toBeTruthy();
});

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('names-only tree: ArrowLeft collapses the selected node, ArrowRight expands it', () => {
  const target = mountTree({ namesOnly: true, selectedId: 1 });
  const root = target.querySelector('[role="tree"]') as HTMLElement;
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy();

  key(root, 'ArrowLeft');
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeNull(); // collapsed via keyboard

  key(root, 'ArrowRight');
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // expanded via keyboard
});
