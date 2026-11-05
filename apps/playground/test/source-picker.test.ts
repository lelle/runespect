import { test, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { helloMessage, treeMessage, PROTOCOL_VERSION } from '@runespect/agent/protocol/internal';
import type { Message, SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

beforeEach(() => localStorage.clear());

// A page announces what it is called in the handshake; who it is comes from `from`, which every
// message it sends carries.
const hello = (id: string, url: string, title = url, agentVersion?: string): Message => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title, ...(agentVersion && { agentVersion }) }),
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

  expect(status(target).textContent).toBe('Live'); // the tier chip stays exactly that
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

// Two tabs on one route look the same by url, so the chip says how many pages there are, and the
// list tells them apart.
test('several sources: the chip counts the pages, and each row of the list says what it is', () => {
  const { target, emit } = panelWith();
  emit(hello('a', '/checkout', 'Shop', '0.2.0'));
  emit(hello('b', '/checkout', 'Shop', '0.2.0'));
  emit(hello('c', '/', 'Shop', '0.1.1'));

  expect(source(target).textContent!.trim()).toBe('/checkout · 3 pages heard ▾');
  source(target).click();
  flushSync();
  const rows = [...picker(target)!.querySelectorAll('button')].map((row) => ({
    url: row.querySelector('.label')!.textContent,
    details: row.querySelector('.details')!.textContent,
    current: row.classList.contains('current'),
  }));
  // Of two pages on one url the panel follows the one it heard from last, as it does today.
  expect(rows).toEqual([
    { url: '/checkout', details: 'Shop · Live · v0.2.0', current: false },
    { url: '/checkout', details: 'Shop · Live · v0.2.0', current: true },
    { url: '/', details: 'Shop · Live · v0.1.1', current: false },
  ]);
});

// A page that navigates on the client says hello again; the panel takes its new url.
test('a page that says hello again under a new url is listed under the new one', () => {
  const { target, emit } = panelWith();
  emit(hello('a', '/', 'Shop'));
  emit(hello('a', '/checkout', 'Checkout'));

  expect(source(target).textContent).toContain('/checkout');
  expect(source(target).textContent).not.toContain('pages');
});

// A panel opened for one url follows that page; when the page navigates away from it on the client,
// the panel goes with it instead of waiting for the old url to come back.
test('a panel opened for a url keeps following its page when the page navigates', () => {
  const { target, emit } = panelWith('/cart');
  emit(hello('a', '/cart', 'Cart'));
  emit({ ...treeMessage([node('CartPage')]), from: 'a' } as Message);
  emit(hello('a', '/checkout', 'Checkout'));
  flushSync();

  expect(source(target).textContent).toContain('/checkout');
  expect(target.querySelector('[data-select="CartPage"]')).toBeTruthy();
});

// Pages say hello on their own when they navigate or retitle. One the panel already knows must not
// take it away from the page it follows; a new page at that url (a reload) still does, as before.
test('a known page that says hello again does not take the panel from the page it follows', () => {
  const { target, emit } = panelWith('/checkout');
  emit(hello('a', '/checkout', 'Shop'));
  emit(hello('b', '/checkout', 'Shop'));
  emit({ ...treeMessage([node('FromB')]), from: 'b' } as Message);

  emit(hello('a', '/checkout', '(1) Shop'));
  flushSync();
  expect(target.querySelector('[data-select="FromB"]')).toBeTruthy();

  emit(hello('c', '/checkout', 'Shop'));
  emit({ ...treeMessage([node('FromC')]), from: 'c' } as Message);
  flushSync();
  expect(target.querySelector('[data-select="FromC"]')).toBeTruthy();
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
