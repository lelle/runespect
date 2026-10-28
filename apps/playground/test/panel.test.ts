import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { Panel } from '@runespect/ui/internal';
import App from '../src/App.svelte';

let stop: (() => void) | undefined;
beforeEach(() => {
  agent.reset();
  localStorage.clear(); // isolate persisted panel prefs between tests
});
afterEach(() => {
  stop?.();
  stop = undefined;
});

const flush = async () => {
  await new Promise((r) => setTimeout(r, 0)); // window 'message' is async
  flushSync();
};

test('Panel renders from a tree message and sends request + edit via the transport', () => {
  let listener: ((m: any) => void) | undefined;
  const sent: any[] = [];
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => {
      listener = cb;
      return () => {};
    },
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  expect(sent.some((m) => m.kind === 'request')).toBe(true); // asks for the tree on connect

  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [
      {
        id: 1,
        name: 'Counter',
        parent: null,
        children: [],
        values: { count: 5 },
        snippets: [],
        writable: ['count'],
      },
    ],
  });
  flushSync();
  // React-style split: select the node, then edit it in the detail pane
  (target.querySelector('[data-select="Counter"]') as HTMLElement).click();
  flushSync();
  expect(
    (target.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement).value,
  ).toBe('5');

  const input = target.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement;
  input.value = '9';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(sent.find((m) => m.kind === 'edit')).toMatchObject({
    id: 1,
    symbol: 'count',
    path: [],
    value: 9,
  });
});

test('the tree/detail split is resizable via the keyboard separator', () => {
  const transport = { send: () => {}, onMessage: () => () => {} };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  const resizer = target.querySelector('[data-testid="runespect-resizer"]') as HTMLElement;
  expect(resizer).toBeTruthy();
  expect(resizer.getAttribute('role')).toBe('separator');
  expect(resizer.getAttribute('aria-valuenow')).toBe('45'); // default split

  const press = (k: string) =>
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  press('ArrowRight');
  flushSync();
  expect(resizer.getAttribute('aria-valuenow')).toBe('49'); // wider tree pane

  press('ArrowLeft');
  press('ArrowLeft');
  flushSync();
  expect(resizer.getAttribute('aria-valuenow')).toBe('41');

  for (let i = 0; i < 30; i++) press('ArrowLeft');
  flushSync();
  expect(resizer.getAttribute('aria-valuenow')).toBe('20'); // clamps at the min
});

test('the panel persists the split position across remounts', () => {
  const transport = { send: () => {}, onMessage: () => () => {} };
  const t1 = document.createElement('div');
  document.body.appendChild(t1);
  mount(Panel, { target: t1, props: { transport } });
  flushSync();

  const r1 = t1.querySelector('[data-testid="runespect-resizer"]') as HTMLElement;
  expect(r1.getAttribute('aria-valuenow')).toBe('45');
  r1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flushSync();
  expect(r1.getAttribute('aria-valuenow')).toBe('49'); // saved to localStorage

  // a fresh mount restores the saved split
  const t2 = document.createElement('div');
  document.body.appendChild(t2);
  mount(Panel, { target: t2, props: { transport } });
  flushSync();
  expect(
    (t2.querySelector('[data-testid="runespect-resizer"]') as HTMLElement).getAttribute(
      'aria-valuenow',
    ),
  ).toBe('49');
});

test('an empty tree broadcast does not blank a tree already shown (e.g. leftover capture bridge)', () => {
  let listener: ((m: any) => void) | undefined;
  const transport = { send: () => {}, onMessage: (cb: any) => ((listener = cb), () => {}) };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  const tree = (nodes: any[]) => ({ source: 'runespect', kind: 'tree', nodes });
  listener!(
    tree([
      {
        id: 1,
        name: 'Counter',
        parent: null,
        children: [],
        values: {},
        snippets: [],
        writable: [],
      },
    ]),
  );
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy();

  // an empty broadcast (capture with no recorded data) must NOT wipe the rendered tree
  listener!(tree([]));
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy();
});

test('the "state" filter toggle hides components without reactive values', () => {
  let listener: ((m: any) => void) | undefined;
  const transport = { send: () => {}, onMessage: (cb: any) => ((listener = cb), () => {}) };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [
      {
        id: 1,
        name: 'App',
        parent: null,
        children: [2, 3],
        values: {},
        snippets: [],
        writable: [],
      },
      {
        id: 2,
        name: 'Counter',
        parent: 1,
        children: [],
        values: { count: 1 },
        snippets: [],
        writable: ['count'],
      },
      { id: 3, name: 'Static', parent: 1, children: [], values: {}, snippets: [], writable: [] },
    ],
  });
  flushSync();
  expect(target.querySelector('[data-component="Static"]')).toBeTruthy();

  (target.querySelector('[data-testid="runespect-only-stateful"]') as HTMLButtonElement).click();
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // stateful kept
  expect(target.querySelector('[data-component="Static"]')).toBeNull(); // stateless hidden
});

test('the "Hide" input excludes matching components but keeps their children', () => {
  let listener: ((m: any) => void) | undefined;
  const transport = { send: () => {}, onMessage: (cb: any) => ((listener = cb), () => {}) };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [
      { id: 1, name: 'App', parent: null, children: [2], values: {}, snippets: [], writable: [] },
      { id: 2, name: 'Provider', parent: 1, children: [3], values: {}, snippets: [], writable: [] },
      {
        id: 3,
        name: 'Counter',
        parent: 2,
        children: [],
        values: { count: 1 },
        snippets: [],
        writable: [],
      },
    ],
  });
  flushSync();
  expect(target.querySelector('[data-component="Provider"]')).toBeTruthy();

  const hide = target.querySelector('[data-testid="runespect-exclude"]') as HTMLInputElement;
  hide.value = 'Provider';
  hide.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(target.querySelector('[data-component="Provider"]')).toBeNull(); // hidden
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // child kept (re-parented)
});

test('round-trip over window.postMessage: page broadcasts → panel renders → edit flows back', async () => {
  const appTarget = document.createElement('div');
  const panelTarget = document.createElement('div');
  document.body.append(appTarget, panelTarget);

  // page side: instrumented app + broadcast
  mount(App, { target: appTarget });
  flushSync();
  stop = agent.broadcast();
  flushSync();

  // panel side: same window as transport (stands in for the content-script relay)
  mount(Panel, { target: panelTarget, props: { transport: agent.createWindowTransport(window) } });
  flushSync();
  await flush();
  await flush(); // request → hello: the panel learns which pages there are
  await flush();
  await flush(); // request to the page it follows → tree

  (panelTarget.querySelector('[data-select="Counter"]') as HTMLElement).click();
  flushSync();
  const input = panelTarget.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  expect(input.value).toBe('1');

  // edit in the panel → window → agent applies → app updates
  input.value = '77';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  await flush();

  expect(appTarget.querySelectorAll('button')[0].textContent).toBe('77 / 154');
});

test('app-side changes propagate to the panel as incremental ops', async () => {
  const appTarget = document.createElement('div');
  const panelTarget = document.createElement('div');
  document.body.append(appTarget, panelTarget);

  mount(App, { target: appTarget });
  flushSync();
  stop = agent.broadcast();
  flushSync();

  mount(Panel, { target: panelTarget, props: { transport: agent.createWindowTransport(window) } });
  flushSync();
  await flush();
  await flush(); // request → hello: the panel learns which pages there are
  await flush();
  await flush(); // request to the page it follows → tree

  (panelTarget.querySelector('[data-select="Counter"]') as HTMLElement).click();
  flushSync();
  const input = () =>
    panelTarget.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement;
  expect(input().value).toBe('1');

  // change app state directly; the delta flows to the panel as an ops message
  appTarget.querySelectorAll('button')[0].click();
  flushSync();
  await flush();
  await flush();

  expect(input().value).toBe('2');
});
