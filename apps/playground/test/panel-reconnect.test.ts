import { test, expect, vi, afterEach } from 'vitest';
import { registerMessage } from '@runespect/agent/protocol/internal';
import { reconnectingPort, KEEPALIVE_MS } from '../../../packages/extension/src/panel-port';

afterEach(() => vi.useRealTimers());

// A fake chrome.runtime.Port. Each connect() hands out a new one, the way the real API does after
// the service worker has been torn down.
function fakePort() {
  const listeners: ((m: unknown) => void)[] = [];
  const disconnects: (() => void)[] = [];
  return {
    sent: [] as unknown[],
    postMessage(m: unknown) {
      this.sent.push(m);
    },
    onMessage: { addListener: (cb: (m: unknown) => void) => listeners.push(cb) },
    onDisconnect: { addListener: (cb: () => void) => disconnects.push(cb) },
    disconnected: false,
    disconnect() {
      this.disconnected = true;
    },
    _emit: (m: unknown) => listeners.forEach((l) => l(m)),
    _drop: () => disconnects.forEach((d) => d()),
  };
}

function setup() {
  const ports: ReturnType<typeof fakePort>[] = [];
  const connect = vi.fn(() => {
    const p = fakePort();
    ports.push(p);
    return p as unknown as chrome.runtime.Port;
  });
  const received: unknown[] = [];
  const transport = reconnectingPort({ connect, tabId: 7 });
  const off = transport.onMessage?.((m) => received.push(m));
  return { ports, connect, received, transport, off };
}

test('the panel registers its tab as soon as it connects', () => {
  const { ports } = setup();
  expect(ports).toHaveLength(1);
  expect(ports[0].sent).toContainEqual(registerMessage(7));
});

// MV3 tears the service worker down after ~30s idle, which drops the port. Without a reconnect the
// panel would keep a dead port, the background would lose its tab→panel routing, and the tree
// would silently stop updating until DevTools was reopened. Switching to the Console panel and back
// is enough idle time to trigger it.
test('a dropped port is replaced, and the new one re-registers the tab', () => {
  const { ports, received } = setup();

  ports[0]._drop();

  expect(ports).toHaveLength(2);
  expect(ports[1].sent).toContainEqual(registerMessage(7));
  // and asks the page to resend, so the panel isn't stuck until the next state change
  expect(ports[1].sent).toContainEqual({ source: 'runespect', kind: 'request' });
  expect(received).toHaveLength(0);
});

test('messages on the replacement port reach the same subscriber', () => {
  const { ports, received } = setup();
  ports[0]._drop();

  ports[1]._emit({ source: 'runespect', kind: 'tree', nodes: [] });

  expect(received).toEqual([{ source: 'runespect', kind: 'tree', nodes: [] }]);
});

test('sends after a reconnect go to the live port, not the dead one', () => {
  const { ports, transport } = setup();
  ports[0]._drop();

  transport.send({ source: 'runespect', kind: 'request' });

  expect(ports[1].sent).toContainEqual({ source: 'runespect', kind: 'request' });
});

test('a keepalive keeps the worker awake while the panel sits idle', () => {
  vi.useFakeTimers();
  const { ports } = setup();
  const before = ports[0].sent.length;

  vi.advanceTimersByTime(KEEPALIVE_MS + 1);

  expect(ports[0].sent.length).toBeGreaterThan(before);
});

test('closing the panel stops reconnecting', () => {
  const { ports, transport } = setup();
  transport.close();

  ports[0]._drop();

  expect(ports).toHaveLength(1); // no zombie reconnect loop after teardown
});

// The panel is not the only subscriber: the debug mirror listens alongside it. A single-slot
// subscriber would have let the second one silently replace the first.
test('every subscriber gets the messages, across reconnects', () => {
  const { ports, transport } = setup(); // setup() already registered one subscriber
  const second: unknown[] = [];
  transport.onMessage?.((m) => second.push(m));

  ports[0]._emit({ source: 'runespect', kind: 'ops', ops: [] });
  ports[0]._drop();
  ports[1]._emit({ source: 'runespect', kind: 'tree', nodes: [] });

  expect(second).toHaveLength(2);
});

// After the extension is reloaded, connecting from the orphaned panel throws; that must not
// escape the disconnect listener as an uncaught error on every disconnect.
test('a panel that can no longer connect stops trying, and says why', () => {
  const ports: ReturnType<typeof fakePort>[] = [];
  let dead = false;
  const connect = vi.fn(() => {
    if (dead) throw new Error('Extension context invalidated.');
    const p = fakePort();
    ports.push(p);
    return p as unknown as chrome.runtime.Port;
  });
  const transport = reconnectingPort({ connect, tabId: 7 });
  dead = true;

  expect(() => ports[0]._drop()).not.toThrow();
  expect(
    transport.events().some((e) => e.ev === 'drop' && /invalidated/.test(String(e.error))),
  ).toBe(true);
  ports[0]._drop();
  expect(connect).toHaveBeenCalledTimes(2); // tried once more, then stopped
});

test('a port that keeps dropping right away is retried with a growing pause, not in a loop', () => {
  vi.useFakeTimers();
  const { ports } = setup();
  ports[0]._drop(); // the first drop reconnects at once
  expect(ports).toHaveLength(2);
  ports[1]._drop(); // dropped again straight away: wait
  expect(ports).toHaveLength(2);
  vi.advanceTimersByTime(1000);
  expect(ports).toHaveLength(3);
});

test('closing the panel also lets go of the port it holds', () => {
  const { ports, transport } = setup();
  transport.close();
  expect(ports[0].disconnected).toBe(true);
});
