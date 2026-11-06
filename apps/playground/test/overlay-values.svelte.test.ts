import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { Tree } from '@runespect/ui/internal';
import { mountOverlay } from './helpers/overlay';
import { node } from './helpers/panel';

// In a page with many components the overlay's values make the tree hard to read. It shows them
// in the tree, one component at a time ((+) and (−)), or beside it, for the selected component.

beforeEach(() => {
  agent.reset();
  localStorage.clear();
});

function overlay() {
  const { root } = mountOverlay();
  const click = (selector: string) => {
    (root.querySelector(selector) as HTMLElement).click();
    flushSync();
  };
  return { root, click };
}

const counter = node(1, 'Counter', { count: 1 });

test('a tree with collapsible values shows (+), opens on a click, and closes with (−)', () => {
  const target = document.body.appendChild(document.createElement('div'));
  mount(Tree, { target, props: { nodes: [counter], collapsibleValues: true } });
  flushSync();
  const toggle = target.querySelector('[data-values="Counter"]') as HTMLButtonElement;
  expect(toggle.textContent).toBe('(+)');
  expect(target.querySelector('[data-symbol="count"]')).toBeNull();

  toggle.click();
  flushSync();
  expect(toggle.textContent).toBe('(−)');
  expect(target.querySelector('[data-symbol="count"]')).toBeTruthy();

  toggle.click();
  flushSync();
  expect(target.querySelector('[data-symbol="count"]')).toBeNull();
});

test('a tree with collapsible values opens a component it is asked to open', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const tree = mount(Tree, { target, props: { nodes: [counter], collapsibleValues: true } });
  flushSync();
  tree.openValues(1);
  flushSync();

  expect(target.querySelector('[data-symbol="count"]')).toBeTruthy();
});

test('a component that leaves forgets that its values were open', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const props = $state({ nodes: [counter], collapsibleValues: true });
  mount(Tree, { target, props });
  flushSync();
  (target.querySelector('[data-values="Counter"]') as HTMLButtonElement).click();
  flushSync();
  props.nodes = [];
  flushSync();
  props.nodes = [counter];
  flushSync();

  expect(target.querySelector('[data-values="Counter"]')!.textContent).toBe('(+)');
});

test('a tree without collapsible values shows every value, as before', () => {
  const target = document.body.appendChild(document.createElement('div'));
  mount(Tree, { target, props: { nodes: [counter] } });
  flushSync();

  expect(target.querySelector('[data-values]')).toBeNull();
  expect(target.querySelector('[data-symbol="count"]')).toBeTruthy();
});

test('the overlay starts with every component closed, and (+) opens one in place', () => {
  const { root, click } = overlay();
  expect(root.querySelectorAll('[data-edit="Counter.count"]')).toHaveLength(0);

  click('[data-values="Counter"]');

  expect(root.querySelectorAll('[data-edit="Counter.count"]')).toHaveLength(1);
  expect(root.querySelector('[data-values="Counter"]')!.textContent).toBe('(−)');
});

test('searching to a component opens it', () => {
  const { root } = overlay();
  const search = root.querySelector('[data-testid="runespect-search"]') as HTMLInputElement;
  search.value = 'Counter';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  expect(root.querySelector('[data-values="Counter"]')!.textContent).toBe('(−)');
});

test('searching again to the selected component opens the values that were closed', () => {
  const { root, click } = overlay();
  const search = root.querySelector('[data-testid="runespect-search"]') as HTMLInputElement;
  search.value = 'Counter';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click('[data-values="Counter"]');
  expect(root.querySelector('[data-values="Counter"]')!.textContent).toBe('(+)');

  search.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  expect(root.querySelector('[data-values="Counter"]')!.textContent).toBe('(−)');
});

test('beside the tree: names only, and the selected component values below a divider', () => {
  const { root, click } = overlay();
  click('[data-testid="runespect-settings"]');
  const select = root.querySelector('[data-setting="Values"]') as HTMLSelectElement;
  select.value = 'Beside the tree';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(root.querySelector('[data-values]')).toBeNull();
  expect(
    root.querySelector('[data-testid="runespect-resizer"]')!.getAttribute('aria-orientation'),
  ).toBe('horizontal');
  click('[data-select="Counter"]');
  expect(root.querySelector('[data-testid="runespect-detail"]')!.textContent).toContain('Counter');
  expect(localStorage.getItem('runespect:overlayValues')).toBe('"Beside the tree"');
});

// The name is the toggle, as a row is in the panel; Open in editor is its own </> beside it.
test('a click on a name opens and closes its values; </> opens the editor', () => {
  const { root, click } = overlay();
  const name = root.querySelector('[data-component="Counter"] > .name') as HTMLElement;
  expect(name.tagName).toBe('BUTTON');

  click('[data-component="Counter"] > .name');
  expect(root.querySelectorAll('[data-edit="Counter.count"]')).toHaveLength(1);
  click('[data-component="Counter"] > .name');
  expect(root.querySelectorAll('[data-edit="Counter.count"]')).toHaveLength(0);

  const source = root.querySelector('a[data-open="Counter"]') as HTMLAnchorElement;
  expect(source.textContent).toBe('</>');
  expect(source.title).toBe('Open in editor');
});
