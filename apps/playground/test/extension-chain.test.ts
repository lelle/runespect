import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import {
  PANEL_PORT,
  isControl,
  requestMessage,
  type ControlMessage,
  type Message,
  type RunespectEvent,
} from '@runespect/agent/protocol/internal';
import { startRelay } from '../../../packages/extension/src/relay';
import { startRouting } from '../../../packages/extension/src/routing';
import { startPanel } from '../../../packages/extension/src/panel-hop';
import { fakeChrome } from './helpers/fake-chrome';
import App from '../src/App.svelte';

// The extension as one chain, on the fake Chrome: the page agent and the relay share the jsdom
// window, the background routes by tab, and the panel's port reconnects as it does in DevTools.
// Each hop has its own tests; this is the one that joins them.

const TAB = 1;
let stops: (() => void)[] = [];
beforeEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
  agent.reset();
});

async function chain() {
  const chrome = fakeChrome();
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  stops.push(agent.broadcast(), startRelay(window, chrome.contentRuntime(TAB)));
  startRouting(chrome.workerRuntime, chrome.tabs);
  const evalInPage = chrome.evalIn(window);
  const panel = startPanel({
    connect: () => chrome.connect(PANEL_PORT),
    tabId: TAB,
    evalInPage,
    schedule: queueMicrotask,
  });
  const port = panel.transport;
  stops.push(port.close);
  // The port carries the background's control messages as well as the page's.
  const heard: (Message | ControlMessage)[] = [];
  port.onMessage?.((m: Message | ControlMessage) => heard.push(m));
  // A panel asks every page who is there, then asks the one it follows by name.
  port.send(requestMessage());
  await chrome.settle();
  const page = heard.find((m) => m.kind === 'hello')!.from!;
  const ask = (): void => port.send({ ...requestMessage(), to: page });
  return { chrome, port, panel, heard, ask, evalInPage };
}

const pageEvents = (): RunespectEvent[] =>
  (globalThis as unknown as { __runespect: { events: RunespectEvent[] } }).__runespect.events;

test("a panel's request reaches its page, and the page's tree comes back to it", async () => {
  const { chrome, heard, ask } = await chain();
  heard.length = 0;

  ask();
  await chrome.settle();

  const tree = heard.find((m) => m.kind === 'tree');
  expect(tree && 'nodes' in tree && tree.nodes.some((n) => n.name === 'App')).toBe(true);
});

test("the relay's events reach the page's timeline", async () => {
  const { chrome, ask } = await chain();
  ask();
  await chrome.settle();

  const relay = pageEvents().filter((e) => e.hop === 'relay');
  expect(relay.map((e) => e.ev)).toEqual(expect.arrayContaining(['rx', 'tx']));
});

test('a tab that cannot be reached is reported to its panel as a drop', async () => {
  const { chrome, heard, ask } = await chain();
  chrome.unreachable(TAB);

  ask();
  await chrome.settle();

  const reports = heard.flatMap((m) => (isControl(m) && m.kind === 'events' ? m.events : []));
  expect(reports.map((e) => `${e.hop}:${e.ev}`)).toEqual(['background:drop']);
});

test('after the worker restarts, the panel reconnects and its page answers again', async () => {
  const { chrome, port, heard, ask } = await chain();
  chrome.restartWorker();
  startRouting(chrome.workerRuntime, chrome.tabs);
  await chrome.settle();
  heard.length = 0;

  ask();
  await chrome.settle();

  expect(
    pageEvents()
      .filter((e) => e.hop === 'panel-port')
      .map((e) => e.ev),
  ).toEqual(expect.arrayContaining(['disconnect', 'reconnect']));
  expect(heard.some((m) => m.kind === 'tree')).toBe(true);
});

const hops = (): string[] => [...new Set(pageEvents().map((e) => e.hop))].sort();

test('every hop of the extension shows in the page timeline', async () => {
  const { chrome, ask } = await chain();
  chrome.unreachable(TAB);
  ask();
  await chrome.settle();

  expect(hops()).toEqual(['agent', 'background', 'panel', 'panel-port', 'relay']);
});

test('a drop shows once in the page, however often the panel mirrors', async () => {
  const { chrome, ask } = await chain();
  chrome.unreachable(TAB);
  ask();
  await chrome.settle();
  ask();
  await chrome.settle();

  expect(
    pageEvents()
      .filter((e) => e.hop === 'background')
      .map((e) => e.ev),
  ).toEqual(['drop', 'drop']);
});

// The panel outlives its page: after a reload the new page has none of what the panel recorded.
test("a page reloaded under an open panel gets the panel's earlier events", async () => {
  const { chrome, ask } = await chain();
  const before = pageEvents().filter((e) => e.hop === 'panel');
  agent.reset();
  stops.push(agent.broadcast());
  ask();
  await chrome.settle();

  expect(pageEvents()).toEqual(expect.arrayContaining(before));
});

test('a panel whose extension was reloaded tries once to mirror, then stops', async () => {
  const { chrome, panel, evalInPage } = await chain();
  chrome.invalidate();
  const calls = evalInPage.calls;
  panel.onError('tree', new Error('boom'));
  await chrome.settle();
  panel.onError('detail', new Error('boom'));
  await chrome.settle();

  expect(evalInPage.calls).toBe(calls + 1);
});
