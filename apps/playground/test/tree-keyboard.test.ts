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
const nodes = [n(1, null, [2, 3]), n(2, 1, []), n(3, 1, [])];

function mountTree(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes, namesOnly: true, ...props } });
  flushSync();
  return target;
}

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('names-only tree: ArrowDown/Up move the selection via onSelect', () => {
  const picks: (number | null)[] = [];
  const target = mountTree({ selectedId: 1, onSelect: (id: number | null) => picks.push(id) });
  const tree = target.querySelector('[role="tree"]') as HTMLElement;
  expect(tree).toBeTruthy();

  key(tree, 'ArrowDown');
  flushSync();
  expect(picks.at(-1)).toBe(2);
});

test('names-only tree: Escape clears the selection (onSelect null)', () => {
  const picks: (number | null)[] = [];
  const target = mountTree({ selectedId: 2, onSelect: (id: number | null) => picks.push(id) });
  const tree = target.querySelector('[role="tree"]') as HTMLElement;
  key(tree, 'Escape');
  flushSync();
  expect(picks.at(-1)).toBeNull();
});

test('names-only tree: Meta+click toggles the selected row off; plain click selects', () => {
  const picks: (number | null)[] = [];
  const target = mountTree({ selectedId: 2, onSelect: (id: number | null) => picks.push(id) });
  const click = (sel: string, meta: boolean) =>
    target
      .querySelector(sel)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: meta }));

  click('[data-select="N2"]', true); // Meta+click on the selected row → clear
  flushSync();
  expect(picks.at(-1)).toBeNull();

  click('[data-select="N3"]', false); // plain click → select
  flushSync();
  expect(picks.at(-1)).toBe(3);
});

test('keyboard nav highlights the selected node and suppresses hover until the mouse moves', () => {
  const hovers: (number | null)[] = [];
  const target = mountTree({ selectedId: 1, onHover: (id: number | null) => hovers.push(id) });
  const tree = target.querySelector('[role="tree"]') as HTMLElement;

  key(tree, 'ArrowDown');
  flushSync();
  expect(hovers.at(-1)).toBe(2); // selected node highlighted via keyboard

  const row = target.querySelector('[data-select="N3"]') as HTMLElement;
  row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  flushSync();
  expect(hovers.at(-1)).toBe(2); // hover suppressed while keyboard-navigating

  window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); // a real mouse move re-enables hover
  row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  flushSync();
  expect(hovers.at(-1)).toBe(3);
});

test('full tree (not names-only) does not hijack arrow keys', () => {
  const picks: (number | null)[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: { nodes, selectedId: 1, onSelect: (id: number | null) => picks.push(id) },
  });
  flushSync();
  const tree = target.querySelector('[role="tree"]');
  // overlay mode: no role=tree keyboard target, arrow keys are inert
  expect(tree).toBeNull();
});

// Focus stays on the tree itself: a focused row button is destroyed once the selection scrolls out
// of the rendered window, and focus would fall to <body>. The selected row is announced through
// aria-activedescendant instead.
test('names-only tree: the tree is named and points at the selected row', () => {
  const target = mountTree({ selectedId: 2 });
  const tree = target.querySelector('[role="tree"]') as HTMLElement;
  expect(tree.getAttribute('aria-label')).toBe('Components');
  const active = tree.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  const row = target.querySelector(`[id="${active}"]`) as HTMLElement;
  expect(row.getAttribute('role')).toBe('treeitem');
  expect(row.dataset.component).toBe('N2');
});

test('names-only tree: row buttons are not tab stops, and focusing one focuses the tree', () => {
  const target = mountTree({ selectedId: 1 });
  const tree = target.querySelector('[role="tree"]') as HTMLElement;
  const buttons = [...target.querySelectorAll<HTMLElement>('[role="treeitem"] button')];
  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.every((b) => b.tabIndex === -1)).toBe(true);

  (target.querySelector('[data-select="N3"]') as HTMLElement).focus();
  expect(document.activeElement).toBe(tree);
});

test('names-only tree: each row says where it sits among its siblings', () => {
  const target = mountTree({ selectedId: 1 });
  const row = (name: string) => target.querySelector(`[data-component="${name}"]`) as HTMLElement;
  const position = (name: string) => [
    row(name).getAttribute('aria-posinset'),
    row(name).getAttribute('aria-setsize'),
  ];
  expect(position('N1')).toEqual(['1', '1']);
  expect(position('N2')).toEqual(['1', '2']);
  expect(position('N3')).toEqual(['2', '2']);
});
