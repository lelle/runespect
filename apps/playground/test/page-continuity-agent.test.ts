import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';
import App from '../src/App.svelte';

// A page that a panel has watched keeps its id in sessionStorage, which belongs to the tab and
// survives a reload, says which page it replaces when it loads, and says bye when it goes. Until a
// panel speaks to it, it writes nothing and says no bye.

const KEY = '__runespect_page';
const stops: (() => void)[] = [];
beforeEach(() => {
  agent.reset();
  sessionStorage.clear();
  setVisible(true);
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.restoreAllMocks();
});

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  });
}

function connected() {
  const sent: Message[] = [];
  let deliver: (m: Message) => void = () => {};
  stops.push(
    agent.connect({
      send: (m) => sent.push(m),
      onMessage: (cb) => {
        deliver = cb;
        return () => {};
      },
    }),
  );
  const self = () => (sent[0] as { from: string }).from;
  return {
    sent,
    self,
    kinds: () => sent.map((m) => m.kind),
    ask: (to?: string) => deliver({ ...requestMessage(), ...(to ? { to } : {}) }),
    ping: (to: string) => deliver({ source: 'runespect', kind: 'ping', to }),
    deliver: (m: Message) => deliver(m),
  };
}

const pagehide = () => window.dispatchEvent(new Event('pagehide'));
const pageshow = (persisted: boolean) =>
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
const settled = () => new Promise((r) => setTimeout(r, 0));

test('a page no panel has spoken to writes nothing and says no bye', () => {
  const page = connected();
  pagehide();

  expect(sessionStorage.getItem(KEY)).toBeNull();
  expect(page.kinds()).toEqual(['hello']);
});

test('once asked who is there, it keeps its id in the tab and says bye when it goes', () => {
  const page = connected();
  page.ask();
  pagehide();

  expect(sessionStorage.getItem(KEY)).toBe(page.self());
  expect(page.sent.at(-1)).toMatchObject({ kind: 'bye', from: page.self() });
});

test('a page that finds an id says it replaces that page, keeps its own, and says bye unasked', () => {
  sessionStorage.setItem(KEY, 'i7');
  const page = connected();
  pagehide();

  expect(page.sent[0]).toMatchObject({ kind: 'hello', replaces: 'i7' });
  expect(sessionStorage.getItem(KEY)).toBe(page.self());
  expect(page.kinds()).toEqual(['hello', 'bye']);
});

test('two connections in one page both name the page before, never their own', () => {
  sessionStorage.setItem(KEY, 'i7');
  const a = connected();
  const b = connected();

  expect(a.sent[0]).toMatchObject({ replaces: 'i7' });
  expect(b.sent[0]).toMatchObject({ replaces: 'i7' });
});

test('a page that said bye says no hello as it is hidden', async () => {
  const page = connected();
  page.ask();
  pagehide();
  setVisible(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await settled();

  expect(page.kinds()).toEqual(['hello', 'hello', 'bye']);
});

test('back from the back/forward cache it says hello with no replaces, and keeps its id again', () => {
  sessionStorage.setItem(KEY, 'i7');
  const page = connected();
  pagehide();
  sessionStorage.setItem(KEY, 'other');
  pageshow(true);
  pageshow(false);

  expect(page.sent.at(-1)).toMatchObject({ kind: 'hello' });
  expect(page.sent.at(-1)).not.toHaveProperty('replaces');
  expect(page.kinds()).toEqual(['hello', 'bye', 'hello']);
  expect(sessionStorage.getItem(KEY)).toBe(page.self());
});

test('pinged, it answers and watches its page, but sends no tree as the app changes', async () => {
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  const page = connected();
  page.ping(page.self());
  (document.querySelector('button') as HTMLButtonElement).click();
  flushSync();
  document.title = 'Elsewhere';
  await settled();

  expect(page.kinds()).toEqual(['hello', 'hello', 'hello']);
  expect(page.sent.at(-1)).toMatchObject({ title: 'Elsewhere' });
  expect(sessionStorage.getItem(KEY)).toBe(page.self());
});

test('a ping for another page does nothing', () => {
  const page = connected();
  page.ping('someone-else');

  expect(page.kinds()).toEqual(['hello']);
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

test('with sessionStorage unavailable it names no page before, and a watched page still says bye', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  const page = connected();
  page.ask();
  pagehide();

  expect(page.sent[0]).not.toHaveProperty('replaces');
  expect(page.kinds()).toEqual(['hello', 'hello', 'bye']);
});

test('the hello says whether the tab is visible, and a watched page says so again when it changes', async () => {
  const page = connected();
  page.ask();
  setVisible(false);
  document.dispatchEvent(new Event('visibilitychange'));
  await settled();

  expect(page.sent[0]).toMatchObject({ visible: true });
  expect(page.sent.at(-1)).toMatchObject({ kind: 'hello', visible: false });
});

// A page cannot replace itself, whatever the tab holds (a connection made again in the same load).
test('a page that finds its own id names no page before it', () => {
  const first = connected();
  first.ask();
  stops.splice(0).forEach((stop) => stop());
  agent.reset();
  const again = connected();

  expect(again.sent[0]).not.toHaveProperty('replaces');
});

test('a ping for no page in particular does nothing', () => {
  const page = connected();
  page.deliver({ source: 'runespect', kind: 'ping' } as Message);

  expect(page.kinds()).toEqual(['hello']);
  expect(sessionStorage.getItem(KEY)).toBeNull();
});
