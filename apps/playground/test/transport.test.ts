import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { editMessage, isFunctionValue, applyOps } from '@runespect/agent/protocol/internal';
import App from '../src/App.svelte';
import CardHost from '../src/CardHost.svelte';
import List from '../src/List.svelte';
import Toggler from '../src/Toggler.svelte';
import SharedList from '../src/SharedList.svelte';
import { shared } from '../src/shared.svelte';
import { openPanel } from './helpers/agent';

let disconnect: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
});

function memoryTransport() {
  const sent: any[] = [];
  let listener: ((msg: any) => void) | null = null;
  return {
    sent,
    emit: (msg: any) => listener?.(msg),
    transport: {
      send: (m: any) => sent.push(m),
      onMessage: (cb: any) => {
        listener = cb;
        return () => (listener = null);
      },
    },
  };
}

// Fold the wire stream (one initial tree snapshot + incremental ops) into the current tree,
// exactly as a consumer panel does. The agent sends deltas after the first message.
function currentNodes(sent: any[]): any[] {
  let nodes: any[] = [];
  for (const m of sent) {
    if (m.kind === 'tree') nodes = m.nodes;
    else if (m.kind === 'ops') nodes = applyOps(nodes, m.ops);
  }
  return nodes;
}

test('connect pushes a clone-safe tree snapshot whenever the store changes', () => {
  const t = memoryTransport();
  disconnect = agent.connect(openPanel(t.transport));

  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();

  const nodes = currentNodes(t.sent);
  expect(nodes.map((n: any) => n.name)).toEqual(expect.arrayContaining(['App', 'Counter']));
  // a Counter exposes a writable 'count'
  const counter = nodes.find((n: any) => n.name === 'Counter');
  expect(counter.writable).toContain('count');
  // serialize carries the per-symbol kind so a detail pane can group by category
  expect(counter.kinds.count).toBe('state');
  // every message is structured-clone-safe (no functions) — would throw otherwise
  expect(() => t.sent.map((m) => structuredClone(m))).not.toThrow();
});

test('array/object values are structured-clone-safe (de-proxied by serialize)', () => {
  const t = memoryTransport();
  disconnect = agent.connect(openPanel(t.transport));

  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(List, { target, props: { items: ['a', 'b', 'c'] } });
  flushSync();

  expect(() => t.sent.map((m) => structuredClone(m))).not.toThrow(); // would throw on a reactive proxy
  const list = currentNodes(t.sent).find((n: any) => n.name === 'List');
  expect(list.values.items).toEqual(['a', 'b', 'c']);
});

test('snippet props serialize to a function marker, not a function', () => {
  const t = memoryTransport();
  disconnect = agent.connect(openPanel(t.transport));

  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(CardHost, { target });
  flushSync();

  const card = currentNodes(t.sent).find((n: any) => n.name === 'Card');
  expect(isFunctionValue(card.values.children)).toBe(true);
  expect(typeof card.values.children).not.toBe('function');
});

test('an incoming edit message mutates the app and re-emits a snapshot', () => {
  const t = memoryTransport();
  disconnect = agent.connect(openPanel(t.transport));

  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();

  const counter = currentNodes(t.sent).find((n: any) => n.name === 'Counter');
  t.emit(editMessage(counter.id, 'count', 99));
  flushSync();

  expect(target.querySelectorAll('button')[0].textContent).toBe('99 / 198');
  // the edit re-emits a delta; folding the stream shows the new value
  const after = currentNodes(t.sent).find((n: any) => n.id === counter.id);
  expect(after.values.count).toBe(99);
});

test('createWindowTransport: a transport ignores its OWN echo but a peer receives it', async () => {
  // window.postMessage delivers to the same window's listeners; the transport must drop its own
  // sends, or the agent would re-handle what it sent and loop.
  const a = agent.createWindowTransport(window);
  const b = agent.createWindowTransport(window);
  const ra: any[] = [];
  const rb: any[] = [];
  const offA = a.onMessage!((m: any) => ra.push(m));
  const offB = b.onMessage!((m: any) => rb.push(m));

  a.send({ source: 'runespect', kind: 'tree', nodes: [] });
  await new Promise((r) => setTimeout(r, 0)); // window 'message' is async

  expect(ra.some((m) => m.kind === 'tree')).toBe(false); // sender does NOT see its own echo
  expect(rb.some((m) => m.kind === 'tree')).toBe(true); // a peer transport does
  offA();
  offB();
});

test('connect: no message kind the agent emits is one it handles (no self-echo loop)', () => {
  // An echoing transport mimics window.postMessage's raw behaviour: a sent message is also
  // delivered back to the listener. If the agent handled ANY kind it emits, this loops forever.
  // Echo the agent's own output back at it for several rounds and assert it stays bounded.
  const sent: any[] = [];
  const queue: any[] = [];
  let listener: ((m: any) => void) | null = null;
  const transport = {
    send: (m: any) => (sent.push(m), queue.push(m)),
    onMessage: (cb: any) => ((listener = cb), () => (listener = null)),
  };
  disconnect = agent.connect(openPanel(transport));
  listener!({ source: 'runespect', kind: 'request' }); // → tree + hello (the loop-prone pair)

  for (let round = 0; round < 6; round++) {
    for (const m of queue.splice(0)) listener!(m); // feed the agent its own echoes
  }
  // Drained to steady state: echoing the agent's own output produced no new output. A kind that
  // is both sent and handled never drains (each echo yields another reply) → queue stays non-empty.
  expect(queue.length).toBe(0);
});

// The agent diffs only the nodes that changed since the last flush. Whatever happens to the tree,
// the one a panel folds from the deltas must stay the agent's own, and so must the tree a transport
// that connects later starts from.
test('the tree a panel folds from the deltas stays the tree the agent holds', () => {
  const byId = (nodes: any[]) => [...nodes].sort((a, b) => a.id - b.id);
  const t = memoryTransport();
  disconnect = agent.connect(openPanel(t.transport));
  const same = (sent: any[]) => expect(byId(currentNodes(sent))).toEqual(byId(agent.serialize(1)));

  const host = document.createElement('div');
  document.body.appendChild(host);
  const toggler = mount(Toggler, { target: host });
  flushSync();
  same(t.sent);

  const toggle = host.querySelector('button:last-of-type') as HTMLButtonElement;
  toggle.click(); // the child Counter leaves
  flushSync();
  same(t.sent);
  toggle.click(); // and a new one enters
  flushSync();
  same(t.sent);
  (host.querySelector('button') as HTMLButtonElement).click(); // its count changes
  flushSync();
  same(t.sent);

  // A parent that keeps no value of its own changed, only its children.
  const list = mount(SharedList, { target: host });
  flushSync();
  shared.counters = 3;
  flushSync();
  same(t.sent);
  shared.counters = 1;
  flushSync();
  same(t.sent);

  const late = memoryTransport();
  const stopLate = agent.connect(openPanel(late.transport));
  flushSync();
  same(late.sent);

  const island = document.createElement('div');
  document.body.appendChild(island);
  const app = mount(App, { target: island });
  flushSync();
  same(t.sent);
  same(late.sent);

  unmount(app);
  unmount(list);
  unmount(toggler);
  flushSync();
  same(t.sent);
  same(late.sent);
  stopLate();
});
