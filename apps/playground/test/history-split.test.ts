import { test, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { treeMessage, opsMessage } from '@runespect/agent/protocol/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

beforeEach(() => localStorage.clear());

const cart = (lines: unknown[], total: number): SerializedNode => ({
  id: 9,
  name: 'Cart',
  parent: null,
  children: [],
  snippets: [],
  values: { lines, total },
  writable: ['lines'],
});

function panelWith() {
  const panel = mountPanel();
  panel.emit(treeMessage([cart([{ id: 1 }], 120)]));
  panel.emit(opsMessage([{ op: 'update', node: cart([{ id: 1 }, { id: 2 }], 240) }], 7, 1000));
  panel.click('[data-tab="history"]');
  return panel;
}

const detail = (t: HTMLElement) => t.querySelector('[data-testid="runespect-history-detail"]');

test('the history tab has the same two-pane shape as the tree', () => {
  const { target } = panelWith();
  expect(target.querySelector('[data-testid="runespect-resizer"]')).toBeTruthy();
  expect(target.querySelector('[data-testid="runespect-history"]')).toBeTruthy();
});

test('the list is one line per commit; the changes live in the right pane', () => {
  const { target } = panelWith();
  const row = target.querySelector('[data-commit="7"]') as HTMLButtonElement;
  expect(row.textContent).toContain('2 changes');
  expect(detail(target)!.textContent).toContain('Select a commit');

  row.click();
  flushSync();
  expect(detail(target)!.textContent).toContain('Cart.lines');
  expect(detail(target)!.textContent).toContain('Cart.total');
});

test('a change shows what it was and what it became', () => {
  const { target } = panelWith();
  (target.querySelector('[data-commit="7"]') as HTMLButtonElement).click();
  flushSync();

  const total = detail(target)!.querySelector('[data-change-detail="Cart.total"]')!;
  expect(total.textContent).toContain('120');
  expect(total.textContent).toContain('240');
});

// A past value is a depth-1 stub, and hydrate() fetches the CURRENT value — so offering to drill
// would quietly show today's data as if it were the past.
test('the right pane says that deeper levels of a past value were not kept', () => {
  const { target } = panelWith();
  (target.querySelector('[data-commit="7"]') as HTMLButtonElement).click();
  flushSync();

  expect(detail(target)!.textContent).toMatch(/not kept for the past/i);
});

test('selecting a commit and clicking a component takes you to it in the tree', () => {
  const { target } = panelWith();
  (target.querySelector('[data-commit="7"]') as HTMLButtonElement).click();
  flushSync();
  (target.querySelector('[data-change="Cart.total"]') as HTMLButtonElement).click();
  flushSync();

  (target.querySelector('[data-tab="tree"]') as HTMLButtonElement).click();
  flushSync();
  expect(target.querySelector('.rs-selected')).toBeTruthy();
});
