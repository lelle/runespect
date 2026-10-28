import { test, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { helloMessage, treeMessage, PROTOCOL_VERSION } from '@runespect/agent/protocol/internal';
import type { Message, SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

beforeEach(() => localStorage.clear());

// A page announces what it is called in the handshake; who it is comes from `from`, which every
// message it sends carries.
const hello = (id: string, url: string, title = url): Message => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title }),
  from: id,
});

const node = (name: string): SerializedNode => ({
  id: 1,
  name,
  parent: null,
  children: [],
  snippets: [],
  values: {},
  writable: [],
});

const panelWith = (initialSourceUrl?: string) => mountPanel({ initialSourceUrl });

// The tier chip and the source chip are siblings: each says one thing, so each can be asserted
// exactly.
const status = (t: HTMLElement) =>
  t.querySelector('[data-testid="runespect-status"]') as HTMLElement;
const source = (t: HTMLElement) =>
  t.querySelector('[data-testid="runespect-source"]') as HTMLElement;
const picker = (t: HTMLElement) => t.querySelector('[data-testid="runespect-sources"]');

test('one source: the panel names what it is looking at, with nothing to choose', () => {
  const { target, emit } = panelWith();
  emit(hello('a', '/cart', 'Cart'));

  expect(status(target).textContent).toBe('Tier 0'); // the tier chip stays exactly that
  expect(source(target).textContent).toContain('/cart');
  expect(source(target).tagName).toBe('SPAN'); // nothing to pick, so nothing to click
  expect(picker(target)).toBeNull();
});

// A forgotten second tab must not answer the panel's questions.
test('two sources: the panel offers a choice and keeps following the first', () => {
  const { target, emit } = panelWith();
  emit(hello('a', '/cart', 'Cart'));
  emit(hello('b', '/admin', 'Admin'));

  expect(source(target).textContent).toContain('/cart');
  source(target).click();
  flushSync();
  expect(picker(target)).toBeTruthy();
  expect(picker(target)!.textContent).toContain('/admin');
});

test('switching source switches the tree', () => {
  const { target, emit } = panelWith();
  emit(hello('a', '/cart'));
  emit(hello('b', '/admin'));
  emit({ ...treeMessage([node('FromAdmin')]), from: 'b' } as Message);

  source(target).click();
  flushSync();
  (target.querySelector('[data-source="b"]') as HTMLButtonElement).click();
  flushSync();
  emit({ ...treeMessage([node('FromAdmin')]), from: 'b' } as Message);

  expect(target.querySelector('[data-select="FromAdmin"]')).toBeTruthy();
});

test('the chosen url is remembered, so a reload lands on the same app', () => {
  const first = panelWith();
  first.emit(hello('a', '/cart'));
  first.emit(hello('b', '/admin'));
  source(first.target).click();
  flushSync();
  (first.target.querySelector('[data-source="b"]') as HTMLButtonElement).click();
  flushSync();

  // A fresh panel, and the app reloaded: same url, new id.
  const second = panelWith();
  second.emit(hello('a2', '/cart'));
  second.emit(hello('b2', '/admin'));

  expect(source(second.target).textContent).toContain('/admin');
});
