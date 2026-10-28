import { test, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { TIER_DOCS_URL } from '@runespect/ui/internal';
import { PROTOCOL_VERSION, helloMessage, treeMessage } from '@runespect/agent/protocol/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const node: SerializedNode = {
  id: 1,
  name: 'App',
  parent: null,
  children: [],
  snippets: [],
  values: {},
  writable: [],
};

const panelWith = () => mountPanel();

const status = (t: HTMLElement) =>
  t.querySelector('[data-testid="runespect-status"]') as HTMLElement;

test('a page that reports its tier shows a quiet chip, not a warning', () => {
  const { target, emit } = panelWith();
  emit(helloMessage(PROTOCOL_VERSION, 0));
  expect(status(target).textContent).toContain('Tier 0');
  expect(status(target).dataset.level).toBe('ok');
  expect(status(target).querySelector('a')).toBeNull(); // nothing to read up on
});

test('a capture is shown as experimental', () => {
  const { target, emit } = panelWith();
  emit(helloMessage(PROTOCOL_VERSION, 2));
  expect(status(target).textContent).toContain('Experimental');
  expect(status(target).dataset.level).toBe('warn');
});

test('a tree with no handshake becomes a Tier 1 warning once the grace period passes', () => {
  const { target, emit } = panelWith();
  emit(treeMessage([node]));
  expect(status(target).dataset.level).toBe('waiting'); // a slow Tier 0 may still announce itself

  vi.advanceTimersByTime(3000);
  flushSync();
  expect(status(target).dataset.level).toBe('warn');
  expect(status(target).textContent).toContain('Tier 1');
  expect(status(target).querySelector('a')!.getAttribute('href')).toBe(TIER_DOCS_URL);
});

test('a late Tier-0 handshake clears the Tier 1 warning', () => {
  const { target, emit } = panelWith();
  emit(treeMessage([node]));
  vi.advanceTimersByTime(3000);
  flushSync();
  expect(status(target).dataset.level).toBe('warn');

  emit(helloMessage(PROTOCOL_VERSION, 0));
  expect(status(target).dataset.level).toBe('ok');
  expect(status(target).textContent).toContain('Tier 0');
});

test('a protocol mismatch takes over the same bar instead of adding a second one', () => {
  const { target, emit } = panelWith();
  emit(helloMessage(PROTOCOL_VERSION + 1, 0));
  expect(status(target).dataset.level).toBe('warn');
  expect(status(target).textContent).toContain('mismatch');
  expect(status(target).textContent).toContain(String(PROTOCOL_VERSION + 1));
  expect(target.querySelectorAll('[data-testid="runespect-status"]')).toHaveLength(1);
});

test("a capture's reason for stopping reaches the status", () => {
  const { target, emit } = panelWith();
  emit({ ...helloMessage(PROTOCOL_VERSION, 2), problem: 'Svelte internals not recognised' });
  expect(status(target).textContent).toContain('Capture stopped');
});
