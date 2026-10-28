import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree, nodeIdForElement, componentElement, elementForNode } from '@runespect/ui/internal';

const nodes = [
  {
    id: 1,
    name: 'App',
    parent: null,
    children: [2],
    values: {},
    snippets: [],
    writable: [],
    loc: '/abs/src/App.svelte',
  },
  {
    id: 2,
    name: 'Counter',
    parent: 1,
    children: [],
    values: { count: 1 },
    snippets: [],
    writable: ['count'],
    loc: '/abs/src/Counter.svelte',
  },
];

function withMeta(el: Element, file: string): Element {
  (el as unknown as { __svelte_meta: unknown }).__svelte_meta = { loc: { file } };
  return el;
}

// DOM element → component node mapping.
test('nodeIdForElement matches a tagged element to its node by its path', () => {
  const el = withMeta(document.createElement('div'), 'src/Counter.svelte');
  expect(nodeIdForElement(el, nodes)).toBe(2);
});

test('nodeIdForElement walks up to the nearest tagged ancestor', () => {
  const comp = withMeta(document.createElement('div'), 'src/Counter.svelte');
  const child = document.createElement('span');
  comp.appendChild(child);
  expect(componentElement(child)).toBe(comp);
  expect(nodeIdForElement(child, nodes)).toBe(2);
});

test('nodeIdForElement returns null when no ancestor is tagged', () => {
  expect(nodeIdForElement(document.createElement('div'), nodes)).toBeNull();
});

test('nodeIdForElement returns null when the file matches no node', () => {
  const el = withMeta(document.createElement('div'), 'src/Unknown.svelte');
  expect(nodeIdForElement(el, nodes)).toBeNull();
});

// Reverse lookup: node → its page element (instance-aware).
test('elementForNode finds the element tagged with the matching file', () => {
  const root = document.createElement('div');
  const other = withMeta(document.createElement('p'), 'src/App.svelte');
  const target = withMeta(document.createElement('span'), 'src/Counter.svelte');
  root.append(other, target);
  const counter = nodes[1];
  expect(elementForNode(counter, nodes, root)).toBe(target);
  expect(elementForNode({ id: 9, loc: '/abs/src/Missing.svelte' }, nodes, root)).toBeNull();
  expect(elementForNode({ id: 9, loc: undefined }, nodes, root)).toBeNull();
});

// Multiple instances of the SAME component must map to DISTINCT elements, not all to the
// first.
function instanceEl(base: string): HTMLElement {
  const rootEl = withMeta(document.createElement('div'), base) as HTMLElement;
  rootEl.appendChild(withMeta(document.createElement('button'), base)); // same-file child
  return rootEl;
}

const twoCounters = [
  { id: 2, loc: '/abs/src/Counter.svelte' },
  { id: 3, loc: '/abs/src/Counter.svelte' },
];

test('elementForNode maps each instance of a repeated component to its own element', () => {
  const root = document.createElement('div');
  const first = instanceEl('src/Counter.svelte');
  const second = instanceEl('src/Counter.svelte');
  root.append(first, second);
  expect(elementForNode(twoCounters[0], twoCounters, root)).toBe(first);
  expect(elementForNode(twoCounters[1], twoCounters, root)).toBe(second);
});

test('nodeIdForElement maps a click in the 2nd instance to the 2nd node, not the 1st', () => {
  const root = document.createElement('div');
  const first = instanceEl('src/Counter.svelte');
  const second = instanceEl('src/Counter.svelte');
  root.append(first, second);
  document.body.appendChild(root);
  try {
    expect(nodeIdForElement(first.querySelector('button'), twoCounters, root)).toBe(2);
    expect(nodeIdForElement(second.querySelector('button'), twoCounters, root)).toBe(3);
  } finally {
    root.remove();
  }
});

// <Tree> marks the selected node.
test('Tree highlights the selected node', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes, selectedId: 2 } });
  flushSync();

  const counter = target.querySelector('[data-component="Counter"]') as HTMLElement;
  const app = target.querySelector('[data-component="App"]') as HTMLElement;
  expect(counter.classList.contains('rs-selected')).toBe(true);
  expect(app.classList.contains('rs-selected')).toBe(false);
});

// Basenames repeat: every SvelteKit layout is +layout.svelte, and libraries have a Button.svelte in
// more than one folder. __svelte_meta carries the project-relative path, the node the absolute one.
const node = (id: number, loc: string) => ({
  id,
  name: loc.split('/').pop()!,
  parent: null,
  children: [],
  values: {},
  snippets: [],
  writable: [],
  loc,
});

function mountTagged(...els: Element[]): HTMLElement {
  const root = document.createElement('div');
  root.append(...els);
  document.body.appendChild(root);
  return root;
}

test('two components with the same file name in different folders are told apart', () => {
  const a = node(3, '/abs/src/a/Button.svelte');
  const b = node(4, '/abs/src/b/Button.svelte');
  const bEl = withMeta(document.createElement('button'), 'src/b/Button.svelte');
  const aEl = withMeta(document.createElement('button'), 'src/a/Button.svelte');
  const root = mountTagged(bEl, aEl); // DOM order differs from registration order

  expect(nodeIdForElement(bEl, [a, b], root)).toBe(4);
  expect(nodeIdForElement(aEl, [a, b], root)).toBe(3);
  expect(elementForNode(b, [a, b], root)).toBe(bEl);
  expect(elementForNode(a, [a, b], root)).toBe(aEl);
});

test('a nested +layout.svelte is its own component, not part of the root layout', () => {
  const outer = node(5, '/abs/src/routes/+layout.svelte');
  const inner = node(6, '/abs/src/routes/blog/+layout.svelte');
  const outerEl = withMeta(document.createElement('div'), 'src/routes/+layout.svelte');
  const innerEl = withMeta(document.createElement('section'), 'src/routes/blog/+layout.svelte');
  outerEl.appendChild(innerEl);
  const root = mountTagged(outerEl);

  expect(nodeIdForElement(innerEl, [outer, inner], root)).toBe(6);
  expect(elementForNode(inner, [outer, inner], root)).toBe(innerEl);
  expect(elementForNode(outer, [outer, inner], root)).toBe(outerEl);
});

test('a file is matched at a folder boundary, preferring the closest path', () => {
  const top = node(7, '/abs/src/Button.svelte');
  const nested = node(8, '/abs/lib/src/Button.svelte');
  const el = withMeta(document.createElement('button'), 'src/Button.svelte');
  const root = mountTagged(el);

  expect(nodeIdForElement(el, [nested, top], root)).toBe(7);
  expect(elementForNode(nested, [nested, top], root)).toBeNull();
});

test('a component outside the Vite root is matched by the part of its path below the parent', () => {
  const shared = node(9, '/abs/shared/Card.svelte');
  const el = withMeta(document.createElement('div'), '../shared/Card.svelte');
  const root = mountTagged(el);
  expect(nodeIdForElement(el, [shared], root)).toBe(9);
});
