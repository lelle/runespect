import { test, expect, beforeEach, afterEach } from 'vitest';
import * as agent from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';

// A page says who it is in its hello: url, title and the agent's version. An app that navigates on
// the client keeps the same page, so it says hello again once its url or title has changed, but
// only after a panel has asked who is there: until then the agent sends nothing.
let stop: (() => void) | undefined;
let navigation: EventTarget;
beforeEach(() => {
  agent.reset();
  history.replaceState(null, '', '/');
  document.title = 'Shop';
  navigation = new EventTarget();
  (globalThis as { navigation?: EventTarget }).navigation = navigation;
});
afterEach(() => {
  stop?.();
  stop = undefined;
  delete (globalThis as { navigation?: EventTarget }).navigation;
});

function connected() {
  const sent: Message[] = [];
  let listener: ((m: Message) => void) | undefined;
  stop = agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      listener = cb;
      return () => (listener = undefined);
    },
  });
  const hellos = () =>
    sent.filter((m) => m.kind === 'hello').map((m) => ({ url: m.url, title: m.title }));
  return { sent, hellos, ask: () => listener!(requestMessage()) };
}

const navigate = (url: string) => {
  history.pushState(null, '', url);
  navigation.dispatchEvent(new Event('currententrychange'));
};
const titleChanges = () => new Promise((r) => setTimeout(r, 0)); // MutationObserver is a microtask

test("the hello names the agent's version", () => {
  const { sent } = connected();

  expect(sent.find((m) => m.kind === 'hello')).toMatchObject({ agentVersion: agent.version });
});

test('after a panel has asked, a navigation to a new url says hello again', () => {
  const { hellos, ask } = connected();
  ask();
  const before = hellos().length;

  navigate('/checkout');

  expect(hellos().slice(before)).toEqual([{ url: '/checkout', title: 'Shop' }]);
});

test('a title the app sets after the url changed says hello again with it', async () => {
  const { hellos, ask } = connected();
  ask();
  navigate('/checkout');
  const before = hellos().length;

  document.title = 'Checkout';
  await titleChanges();

  expect(hellos().slice(before)).toEqual([{ url: '/checkout', title: 'Checkout' }]);
});

test('a navigation that changes neither url nor title says nothing', () => {
  const { hellos, ask } = connected();
  ask();
  const before = hellos().length;

  navigation.dispatchEvent(new Event('currententrychange'));

  expect(hellos().length).toBe(before);
});

test('before any panel has asked, a navigation says nothing', async () => {
  const { hellos } = connected();
  const before = hellos().length;

  navigate('/checkout');
  document.title = 'Checkout';
  await titleChanges();

  expect(hellos().length).toBe(before);
});
