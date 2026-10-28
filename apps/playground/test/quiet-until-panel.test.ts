import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';
import UnreadDerived from '../src/UnreadDerived.svelte';
import CountedStore from '../src/CountedStore.svelte';
import { bump, evaluations, getDoubled } from '../src/modules/unread.svelte';
import { subscribers } from '../src/modules/counted-store';

// Until a panel opens, runespect leaves the app to itself: it reads none of the app's values, so a
// $derived the app never reads is never evaluated, and it sends nothing as the app changes. Once a
// panel asks, it reports for the rest of the page's life.

let app: Record<string, unknown> | undefined;
let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
  if (app) unmount(app);
  app = undefined;
});

function page() {
  const evaluated = { n: 0 };
  const target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(UnreadDerived, { target, props: { onEvaluate: () => evaluated.n++ } });
  flushSync();
  const click = (times: number) => {
    for (let i = 0; i < times; i++) {
      target.querySelector('button')!.click();
      flushSync();
    }
  };
  return { evaluated, click };
}

function panelTransport() {
  const sent: Message[] = [];
  let deliver: (message: Message) => void = () => {};
  stop = agent.connect({
    send: (message) => sent.push(message),
    onMessage: (cb) => {
      deliver = cb;
      return () => {};
    },
  });
  // A panel learns the page from its hello, then asks that page by its id.
  const pageId = () => sent.find((m) => m.kind === 'hello')?.from;
  return {
    sent,
    kinds: () => sent.map((m) => m.kind),
    open: () => deliver({ ...requestMessage(), to: pageId() }),
    ask: (to?: string) => deliver({ ...requestMessage(), ...(to ? { to } : {}) }),
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('without a panel, a $derived the app never reads is never evaluated', async () => {
  const { evaluated, click } = page();
  panelTransport();

  click(5);
  await settled();

  expect(evaluated.n).toBe(0);
});

test('without a panel, a derived in a module the app never reads is never evaluated', () => {
  for (let i = 0; i < 5; i++) {
    bump();
    flushSync();
  }

  expect(evaluations.n).toBe(0);
  expect(getDoubled()).toBe(10); // the app reading it is what evaluates it
  expect(evaluations.n).toBe(1);
});

test('without a panel, a connected page sends only its hello as the app changes', async () => {
  const { click } = page();
  const panel = panelTransport();

  click(5);
  await settled();

  expect(panel.kinds()).toEqual(['hello']);
});

// One dev server is one channel: a panel window asks every page who is there before it picks one,
// and then asks the page it follows. Only that page starts reading.
test('a request for no page in particular, or for another page, only gets a hello', async () => {
  const { evaluated, click } = page();
  const panel = panelTransport();

  panel.ask();
  panel.ask('another-page');
  click(3);
  await settled();

  expect(panel.kinds()).toEqual(['hello', 'hello']);
  expect(evaluated.n).toBe(0);
});

test('once a panel asks, it gets the current values and every change after', async () => {
  const { click } = page();
  const panel = panelTransport();
  click(2);

  panel.open();
  await settled();
  const tree = panel.sent.find((m) => m.kind === 'tree');
  expect(tree && 'nodes' in tree && tree.nodes[0].values).toMatchObject({ count: 2, doubled: 4 });

  click(1);
  await settled();
  expect(panel.kinds()).toContain('ops');
});

test('history starts when a panel opens', async () => {
  const { click } = page();
  const panel = panelTransport();
  click(2);

  panel.open();
  await settled();
  click(1);
  await settled();

  const changes = agent.commits().flatMap((c) => c.changes);
  expect(changes).toEqual([
    expect.objectContaining({ symbol: 'count', from: 2, to: 3 }),
    expect.objectContaining({ symbol: 'doubled', from: 4, to: 6 }),
  ]);
});

// A store does its work for as long as anyone subscribes, so runespect subscribing is a change the
// app can see. In a component that is neither runes nor legacy, runespect reads a store through its
// own subscription: it takes one only once a panel asks, and lets go with the component.
test('a store gets no subscriber from runespect until a panel opens', async () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = mount(CountedStore, { target });
  flushSync();
  const panel = panelTransport();
  await settled();
  expect(subscribers.n).toBe(1);

  panel.open();
  await settled();
  expect(subscribers.n).toBe(2);
  const tree = panel.sent.find((m) => m.kind === 'tree');
  expect(tree && 'nodes' in tree && tree.nodes[0].values).toMatchObject({ $counted: 7 });

  unmount(component);
  expect(subscribers.n).toBe(0);
});
