import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree } from '@runespect/ui/internal';

// Tree is presentational: it renders a hand-built SerializedNode[] with no agent
// involved — exactly what the extension panel feeds it.
function mountTree(nodes: any, onEdit: (...args: any[]) => void = () => {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes, onEdit } });
  flushSync();
  return target;
}

test('renders a nested tree and distinguishes writable vs read-only', () => {
  const nodes = [
    {
      id: 1,
      name: 'App',
      parent: null,
      children: [2],
      values: { title: 'hi' },
      snippets: [],
      writable: [],
    },
    {
      id: 2,
      name: 'Counter',
      parent: 1,
      children: [],
      values: { count: 3, doubled: 6 },
      snippets: [],
      writable: ['count'],
    },
  ];
  const target = mountTree(nodes);

  const app = target.querySelector('[data-component="App"]')!;
  expect(app).toBeTruthy();
  expect(app.querySelector('[data-component="Counter"]')).toBeTruthy(); // nested
  expect(target.querySelector('[data-edit="Counter.count"]')).toBeTruthy(); // writable → input
  expect(target.querySelector('[data-value="Counter.doubled"]')).toBeTruthy(); // read-only → span
  expect(target.querySelector('[data-edit="Counter.doubled"]')).toBeNull();
});

test('editing an input calls onEdit with a type-coerced value', () => {
  const nodes = [
    {
      id: 7,
      name: 'Counter',
      parent: null,
      children: [],
      values: { count: 3 },
      snippets: [],
      writable: ['count'],
    },
  ];
  const edits: any[] = [];
  const target = mountTree(nodes, (id: any, sym: any, path: any, v: any) =>
    edits.push([id, sym, path, v]),
  );

  const input = target.querySelector('[data-edit="Counter.count"]') as HTMLInputElement;
  input.value = '42';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  expect(edits).toContainEqual([7, 'count', [], 42]); // number, not "42"
});

test('renders declared snippets, and a snippet prop as a function with its name', () => {
  const nodes = [
    {
      id: 1,
      name: 'List',
      parent: null,
      children: [],
      values: {},
      snippets: ['row'],
      writable: [],
    },
    {
      id: 2,
      name: 'Card',
      parent: null,
      children: [],
      values: { children: { __runespect: 'function', name: 'children' } },
      snippets: [],
      writable: [],
    },
  ];
  const target = mountTree(nodes);

  expect(target.querySelector('[data-snippet="List.row"]')).toBeTruthy();
  const children = target.querySelector('[data-value="Card.children"]')!;
  expect(children.textContent).toContain('ƒ children');
});
