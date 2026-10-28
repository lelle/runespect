import { test, expect } from 'vitest';
import { PROTOCOL_VERSION } from '@runespect/agent/protocol/internal';
import { bridgeModule, wrapperModule, bootModule } from '../src/served.js';

test('wrapperModule is self-contained: imports the original url, records, no bare specifiers', () => {
  const url = '/node_modules/.vite/deps/svelte_internal_client.js?v=abc';
  const w = wrapperModule(url);

  expect(w).toContain(`import * as real from ${JSON.stringify(url)}`);
  expect(w).toContain(`export * from ${JSON.stringify(url)}`);
  expect(w).toContain('export const state');
  expect(w).toContain('export const push');
  expect(w).toContain('__RS_COLLECTOR__');
  // nothing a page cannot resolve
  expect(w).not.toMatch(/@runespect/);
  expect(w).not.toMatch(/svelte\/internal\/client/);
});

test('bootModule exposes window.__runespectReconstruct and is self-contained', () => {
  const b = bootModule();
  expect(b).toContain('__runespectReconstruct');
  expect(b).toContain('__RS_COLLECTOR__');
  expect(b).not.toMatch(/\bimport\b/);
});

test('the served boot reconstruct matches the collector shape on a hand-built log', () => {
  // exercise the inlined reconstruct (eval the served boot, then call the exposed function)
  const g = globalThis as any;
  g.__RS_COLLECTOR__ = {
    roots: [
      {
        fn: { name: 'Counter' },
        children: [],
        signals: [
          { signal: { label: 'count', v: 3 }, kind: 'state' },
          { signal: { label: 'doubled', v: 6 }, kind: 'derived' },
        ],
      },
    ],
    stack: [],
  };

  (0, eval)(bootModule());
  const nodes = g.__runespectReconstruct();

  expect(nodes).toHaveLength(1);
  expect(nodes[0].name).toBe('Counter');
  expect(nodes[0].values).toEqual({ count: 3, doubled: 6 });
  expect(nodes[0].writable).toEqual(['count']);
  delete g.__RS_COLLECTOR__;
  delete g.__runespectReconstruct;
});

test('the served boot reconstruct prefers the name resolved at push time over the HMR "wrapper" fn', () => {
  const g = globalThis as any;
  // push() (in wrapperModule) records the [FILENAME]-derived name; the fn itself is the HMR wrapper
  g.__RS_COLLECTOR__ = {
    roots: [{ fn: { name: 'wrapper' }, name: 'Counter', children: [], signals: [] }],
    stack: [],
  };

  (0, eval)(bootModule());
  const nodes = g.__runespectReconstruct();

  expect(nodes[0].name).toBe('Counter');
  delete g.__RS_COLLECTOR__;
  delete g.__runespectReconstruct;
});

// Evaluate the served boot against a hand-built frame log and return what it reconstructs.
function reconstructFrom(roots: unknown[]): any[] {
  const g = globalThis as any;
  g.__RS_COLLECTOR__ = { roots, stack: [] };
  try {
    (0, eval)(bootModule());
    return g.__runespectReconstruct();
  } finally {
    delete g.__RS_COLLECTOR__;
    delete g.__runespectReconstruct;
  }
}

const counterFrame = (start: number) => ({
  fn: { name: 'Counter' },
  children: [],
  signals: [
    { signal: { label: 'count', v: start }, kind: 'state' },
    { signal: { label: 'doubled', v: start * 2 }, kind: 'derived' },
  ],
});

test('the served boot reconstruct nests child components under their parent', () => {
  const nodes = reconstructFrom([
    { fn: { name: 'App' }, children: [counterFrame(1), counterFrame(10)], signals: [] },
  ]);
  const app = nodes.find((n) => n.name === 'App');
  const counters = nodes.filter((n) => n.name === 'Counter');
  expect(counters).toHaveLength(2);
  expect(app.children).toEqual(counters.map((c) => c.id));
  for (const c of counters) expect(c.parent).toBe(app.id);
});

test('the served boot reconstruct names an anonymous component and skips unlabelled signals', () => {
  const [node] = reconstructFrom([
    {
      fn: null,
      children: [],
      signals: [
        { signal: { label: undefined, v: 5 }, kind: 'state' },
        { signal: { label: 'ok', v: 7 }, kind: 'state' },
      ],
    },
  ]);
  expect(node.name).toBe('Component');
  expect(node.values).toEqual({ ok: 7 });
});

test('the capture bridge makes symbols clone-safe before posting', () => {
  const g = globalThis as any;
  const posted: any[] = [];
  const win = globalThis.window as any;
  const origPost = win.postMessage;
  win.postMessage = (m: any) => posted.push(m);
  g.__runespectReconstruct = () => [
    {
      id: 1,
      name: 'Counter',
      parent: null,
      children: [],
      values: { pending: Symbol('uninitialized'), n: 1 },
      snippets: [],
      writable: [],
    },
  ];

  (0, eval)(bridgeModule());
  const tree = posted.find((m) => m.kind === 'tree');
  expect(tree).toBeTruthy();
  expect(() => structuredClone(tree)).not.toThrow(); // this is what postMessage does
  expect(tree.nodes[0].values.n).toBe(1);

  clearInterval(g.__rsBridgeTimer);
  delete g.__rsBridge;
  delete g.__runespectReconstruct;
  win.postMessage = origPost;
});

// Run the bridge against a reconstruct that returns `nodes`; returns what it posted and the global
// state it left, then cleans up.
function runBridge(nodes: unknown[]): { posted: any[]; tier0: unknown } {
  const g = globalThis as any;
  const posted: any[] = [];
  const win = globalThis.window as any;
  const origPost = win.postMessage;
  win.postMessage = (m: any) => posted.push(m);
  g.__runespectReconstruct = () => nodes;
  try {
    (0, eval)(bridgeModule());
    return { posted, tier0: g.__runespect_tier0 };
  } finally {
    clearInterval(g.__rsBridgeTimer);
    delete g.__rsBridge;
    delete g.__runespectReconstruct;
    delete g.__runespect_tier0;
    win.postMessage = origPost;
  }
}

const counter = {
  id: 1,
  name: 'Counter',
  parent: null,
  children: [],
  values: { n: 1 },
  snippets: [],
  writable: [],
};

// A dev-captured page keeps its __svelte_meta, so Tier 1 would post its stateless tree too and the
// panel would flip between the two every second.
test('the capture bridge takes the page over from Tier 1 once it has a tree', () => {
  expect(runBridge([counter]).tier0).toBe(true);
});

test('a capture that recorded nothing leaves the page to Tier 1', () => {
  expect(runBridge([]).tier0).toBeUndefined();
});

// The bridge ignores edit messages, so offering edits would let the panel change nothing.
test('the capture bridge sends its tree read-only', () => {
  const { posted } = runBridge([{ ...counter, writable: ['n'] }]);
  expect(posted.find((m) => m.kind === 'tree').nodes[0].writable).toEqual([]);
});

test('the capture bridge says in its hello why a capture stopped', () => {
  (globalThis as any).__RS_CAPTURE__ = { problem: 'Svelte internals not recognised' };
  try {
    const { posted } = runBridge([]);
    expect(posted.find((m) => m.kind === 'hello')).toMatchObject({
      tier: 2,
      problem: 'Svelte internals not recognised',
    });
  } finally {
    delete (globalThis as any).__RS_CAPTURE__;
  }
});

// The panel warns when the page's version differs from its own, so a capture must not lag behind.
test('the capture bridge announces the shared protocol version', () => {
  const { posted } = runBridge([]);
  expect(posted.find((m) => m.kind === 'hello').version).toBe(PROTOCOL_VERSION);
});

// The relay to the extension carries JSON. The bridge encodes values the way the agent does, so a
// capture shows a Map, a Date or a BigInt as what it is, not as {} or a string.
test('the capture bridge encodes values the way the agent does', () => {
  class Service {
    run(): void {}
  }
  const { posted } = runBridge([
    {
      ...counter,
      values: {
        m: new Map([['a', 1]]),
        big: 10n,
        when: new Date(0),
        none: undefined,
        service: new Service(),
      },
    },
  ]);
  const tree = posted.find((m) => m.kind === 'tree');
  expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
  const values = tree.nodes[0].values;
  expect(values.m).toEqual({ __runespect: 'map', entries: [['a', 1]] });
  expect(values.big).toEqual({ __runespect: 'bigint', value: '10' });
  expect(values.when).toEqual({ __runespect: 'date', iso: '1970-01-01T00:00:00.000Z' });
  expect(values.none).toEqual({ __runespect: 'undefined' });
  // The bridge answers no inspect requests, so a stub is final.
  expect(values.service).toMatchObject({ __runespect: 'dehydrated', opaque: true });
});
