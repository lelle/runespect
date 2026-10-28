import { test, expect } from 'vitest';
import { startRelay } from '../../../packages/extension/src/relay';
import { TO_PANEL_KINDS, TO_PAGE_KINDS } from '@runespect/agent/protocol/internal';

// Mocks for the chrome.runtime + window the content-script relay bridges. They copy what crosses as
// the real ones do: the window by structured clone, the runtime as JSON, so a value either cannot
// carry fails here too. A message comes from the page's own window unless a test says otherwise.
function mockWindow(): any {
  const listeners: any[] = [];
  const win: any = {
    sent: [],
    addEventListener: (type: any, l: any) => type === 'message' && listeners.push(l),
    removeEventListener: (_type: any, l: any) => listeners.splice(listeners.indexOf(l), 1),
    postMessage: function (this: any, m: any) {
      this.sent.push(structuredClone(m));
    },
    _emit: (data: any, source: unknown = win) =>
      listeners.forEach((l) => l({ data: structuredClone(data), source })),
  };
  return win;
}
function mockRuntime(): any {
  const listeners: any[] = [];
  return {
    sent: [],
    sendMessage: function (this: any, m: any) {
      this.sent.push(JSON.parse(JSON.stringify(m)));
    },
    onMessage: { addListener: (l: any) => listeners.push(l), removeListener: () => {} },
    _emit: (m: any) => listeners.forEach((l) => l(m)),
  };
}

test('content relay forwards tree page→extension and edit/request extension→page', () => {
  const win = mockWindow();
  const runtime = mockRuntime();
  const stop = startRelay(win, runtime);

  // page → extension: tree and ops messages on the window are forwarded to the runtime
  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  win._emit({ source: 'runespect', kind: 'ops', ops: [{ op: 'remove', id: 1 }] });
  expect(runtime.sent.filter((m: any) => m.kind === 'tree')).toHaveLength(1);
  expect(runtime.sent.filter((m: any) => m.kind === 'ops')).toHaveLength(1);

  // unrelated window messages are ignored
  win._emit({ source: 'other', kind: 'tree' });
  win._emit({ foo: 1 });
  expect(runtime.sent).toHaveLength(2);

  // extension → page: edit + request forwarded to the window; tree is not
  runtime._emit({ source: 'runespect', kind: 'edit', id: 1, symbol: 'x', value: 2 });
  runtime._emit({ source: 'runespect', kind: 'request' });
  runtime._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  expect(win.sent.filter((m: any) => m.source === 'runespect')).toHaveLength(2);

  // bridge actions: panel→page (highlight) forwarded to the window; page→panel (picked) to runtime
  runtime._emit({ source: 'runespect', kind: 'highlight', id: 1 });
  expect(win.sent.some((m: any) => m.kind === 'highlight')).toBe(true);
  win._emit({ source: 'runespect', kind: 'picked', id: 1 });
  expect(runtime.sent.some((m: any) => m.kind === 'picked')).toBe(true);

  stop();
});

test('a stale relay (extension reloaded) tears down on sendMessage failure instead of throwing', () => {
  let removed = false;
  const listeners: any[] = [];
  const win: any = {
    addEventListener: (t: string, l: any) => t === 'message' && listeners.push(l),
    removeEventListener: () => (removed = true),
    postMessage: () => {},
    _emit: (data: any) => listeners.forEach((l) => l({ data, source: win })),
  };
  const runtime: any = {
    sendMessage: () => {
      throw new Error('Extension context invalidated.');
    },
    onMessage: { addListener: () => {}, removeListener: () => {} },
  };
  startRelay(win, runtime);

  expect(() => win._emit({ source: 'runespect', kind: 'tree', nodes: [] })).not.toThrow();
  expect(removed).toBe(true); // the dead relay removed its listeners
});

// Which kinds cross which way comes from the protocol. A kind the relay does not forward would
// break the version handshake, the tier status or lazy values in the extension only. These two
// tests are exhaustive against the protocol, so adding a message kind without wiring the relay
// fails here.
test('content relay forwards every agent→panel kind the protocol defines', () => {
  const win = mockWindow();
  const runtime = mockRuntime();
  startRelay(win, runtime);

  for (const kind of TO_PANEL_KINDS) win._emit({ source: 'runespect', kind });

  expect(runtime.sent.map((m: any) => m.kind).sort()).toEqual([...TO_PANEL_KINDS].sort());
});

test('content relay forwards every panel→agent kind the protocol defines', () => {
  const win = mockWindow();
  const runtime = mockRuntime();
  startRelay(win, runtime);

  for (const kind of TO_PAGE_KINDS) runtime._emit({ source: 'runespect', kind });

  expect(win.sent.map((m: any) => m.kind).sort()).toEqual([...TO_PAGE_KINDS].sort());
});

// One message the runtime refuses (a value JSON cannot carry, say) is not the extension going away:
// only a missing runtime.id means the context was invalidated.
test('a relay whose extension is still there keeps running after one refused message', async () => {
  const win = mockWindow();
  let refuse = true;
  const runtime = {
    ...mockRuntime(),
    id: 'runespect',
    sent: [] as any[],
    sendMessage(m: any) {
      if (refuse) {
        refuse = false;
        throw new TypeError('Do not know how to serialize a BigInt');
      }
      runtime.sent.push(m);
    },
  };
  startRelay(win, runtime);

  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  expect(runtime.sent).toHaveLength(1);

  await Promise.resolve(); // the relay publishes its events on a microtask
  const published = win.sent.filter((m: any) => m.kind === 'events').at(-1);
  expect(published.events.some((e: any) => e.ev === 'drop')).toBe(true);
});

// Any frame on the page can postMessage the top window; only the page itself speaks for it.
test('the relay ignores messages from other frames on the page', () => {
  const win = mockWindow();
  const runtime = mockRuntime();
  startRelay(win, runtime);

  win._emit({ source: 'runespect', kind: 'tree', nodes: [] }, { name: 'an ad iframe' });
  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });

  expect(runtime.sent.filter((m: any) => m.kind === 'tree')).toHaveLength(1);
});

// The agent keeps what it was given, so a burst needs only what is new, not the whole buffer of up
// to 200 events after every message forwarded.
test('the relay posts its event log in bursts of only what the page has not had', async () => {
  const win = mockWindow();
  startRelay(win, mockRuntime());
  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  await Promise.resolve();
  win._emit({ source: 'runespect', kind: 'ops', ops: [] });
  await Promise.resolve();
  const posts = win.sent.filter((m: any) => m.kind === 'events');
  expect(posts).toHaveLength(2);
  expect(posts[1].events.map((e: any) => e.kind)).toEqual(['ops']);
});
