import { test, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import {
  treeMessage,
  opsMessage,
  historyMessage,
  hydrateMessage,
} from '@runespect/agent/protocol/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

beforeEach(() => localStorage.clear());

const counter = (count: number): SerializedNode => ({
  id: 1,
  name: 'Counter',
  parent: null,
  children: [],
  snippets: [],
  values: { count },
  writable: ['count'],
});

const panelWith = () => mountPanel();

const tab = (t: HTMLElement, name: string) =>
  t.querySelector(`[data-tab="${name}"]`) as HTMLButtonElement;
const history = (t: HTMLElement) => t.querySelector('[data-testid="runespect-history"]');

test('the panel opens on the tree, with history one tab away', () => {
  const { target } = panelWith();
  expect(target.querySelector('[role="tree"]')).toBeTruthy();
  expect(history(target)).toBeNull();

  tab(target, 'history').click();
  flushSync();
  expect(history(target)).toBeTruthy();
  expect(target.querySelector('[role="tree"]')).toBeNull();
});

// A panel that connects after the fact has no history of its own — the agent keeps the ring.
test('the panel asks the page for the history it missed', () => {
  const { sent } = panelWith();
  expect(sent.some((m) => m.kind === 'history-request')).toBe(true);
});

test('commits build from the ops the panel already receives', () => {
  const { target, emit } = panelWith();
  emit(treeMessage([counter(1)]));
  emit(opsMessage([{ op: 'update', node: counter(2) }], 7, 1000));

  tab(target, 'history').click();
  flushSync();
  const head = target.querySelector('[data-commit="7"]') as HTMLButtonElement;
  expect(head).toBeTruthy();
  expect(head.textContent).toContain('1 change');

  // Selecting a commit shows its changes in the detail pane beside the list (see history-split).
  head.click();
  flushSync();
  const detail = target.querySelector('[data-testid="runespect-history-detail"]')!;
  expect(detail.querySelector('[data-change="Counter.count"]')).toBeTruthy();
  expect(detail.textContent).toContain('1');
  expect(detail.textContent).toContain('2');
});

test('the backlog from the page merges in without duplicating live commits', () => {
  const { target, emit } = panelWith();
  emit(treeMessage([counter(1)]));
  emit(opsMessage([{ op: 'update', node: counter(2) }], 7, 1000));
  emit(
    historyMessage(
      [
        {
          seq: 6,
          t: 900,
          changes: [{ op: 'update', id: 1, name: 'Counter', symbol: 'count', from: 0, to: 1 }],
        },
        {
          seq: 7,
          t: 1000,
          changes: [{ op: 'update', id: 1, name: 'Counter', symbol: 'count', from: 1, to: 2 }],
        },
      ],
      false,
    ),
  );

  tab(target, 'history').click();
  flushSync();
  expect(target.querySelectorAll('[data-commit="7"]')).toHaveLength(1);
  expect(target.querySelector('[data-commit="6"]')).toBeTruthy();
});

test('a truncated history says so instead of looking complete', () => {
  const { target, emit } = panelWith();
  emit(historyMessage([{ seq: 1, t: 1, changes: [] }], true));

  tab(target, 'history').click();
  flushSync();
  expect(target.querySelector('[data-testid="runespect-history-truncated"]')).toBeTruthy();
});

test('clicking a change selects that component in the tree', () => {
  const { target, emit } = panelWith();
  emit(treeMessage([counter(1)]));
  emit(opsMessage([{ op: 'update', node: counter(2) }], 7, 1000));

  tab(target, 'history').click();
  flushSync();
  (target.querySelector('[data-commit="7"]') as HTMLButtonElement).click();
  flushSync();
  (target.querySelector('[data-change="Counter.count"]') as HTMLButtonElement).click();
  flushSync();

  tab(target, 'tree').click();
  flushSync();
  expect(target.querySelector('.rs-selected')).toBeTruthy();
});

// A value the panel fetched is not one the page changed.
test('an update records what the page changed, not a value the panel fetched', () => {
  const { target, emit } = panelWith();
  const marker = { __runespect: 'dehydrated', type: 'object', preview: '{ a } (1)', size: 1 };
  const app = (n: number): SerializedNode => ({ ...counter(n), values: { cfg: marker, n } });
  emit(treeMessage([app(1)]));
  (target.querySelector('[data-select="Counter"]') as HTMLElement).click();
  flushSync();
  (target.querySelector('[data-detail-value="Counter.cfg"] [data-expand]') as HTMLElement).click();
  flushSync();
  emit(hydrateMessage(1, ['cfg'], { a: 1 }));
  emit(opsMessage([{ op: 'update', node: app(2) }], 7, 1000));

  tab(target, 'history').click();
  flushSync();
  expect(target.querySelector('[data-commit="7"]')?.textContent).toContain('1 change');
});
