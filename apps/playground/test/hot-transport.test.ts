import { test, expect, vi } from 'vitest';
import { createHotTransport, HOT_EVENT } from '@runespect/agent/internal';
import { treeMessage } from '@runespect/agent/protocol/internal';

// A stand-in for import.meta.hot: the same send/on pair Vite gives a module in dev, and the same
// JSON on the way, so what JSON cannot carry is lost here as it is over the real socket.
const overJson = (data: unknown): unknown => JSON.parse(JSON.stringify(data));
function fakeHot() {
  const handlers = new Map<string, ((data: unknown) => void)[]>();
  return {
    sent: [] as { event: string; data: unknown }[],
    send(event: string, data: unknown) {
      this.sent.push({ event, data: overJson(data) });
    },
    on(event: string, cb: (data: unknown) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
    },
    _emit: (event: string, data: unknown) =>
      (handlers.get(event) ?? []).forEach((cb) => cb(overJson(data))),
  };
}

test('a message is sent over the hot channel under one event name', () => {
  const hot = fakeHot();
  createHotTransport(hot).send(treeMessage([]));

  expect(hot.sent).toHaveLength(1);
  expect(hot.sent[0].event).toBe(HOT_EVENT);
  expect(hot.sent[0].data).toMatchObject({ source: 'runespect', kind: 'tree' });
});

test('incoming messages reach the subscriber', () => {
  const hot = fakeHot();
  const seen: unknown[] = [];
  createHotTransport(hot).onMessage?.((m) => seen.push(m));

  hot._emit(HOT_EVENT, { source: 'runespect', kind: 'request', __rsFrom: 'somebody-else' });

  expect(seen).toEqual([{ source: 'runespect', kind: 'request', __rsFrom: 'somebody-else' }]);
});

// The broker rebroadcasts to every client, the sender included — without this the agent would
// answer its own request forever, as it would on window.postMessage.
test('a transport ignores the echo of its own send', () => {
  const hot = fakeHot();
  const seen: unknown[] = [];
  const transport = createHotTransport(hot);
  transport.onMessage?.((m) => seen.push(m));

  transport.send(treeMessage([]));
  hot._emit(HOT_EVENT, hot.sent[0].data); // the broker bounces it straight back

  expect(seen).toEqual([]);
});

test('two transports on the same channel hear each other', () => {
  const hot = fakeHot();
  const panelSaw: unknown[] = [];
  const app = createHotTransport(hot);
  createHotTransport(hot).onMessage?.((m) => panelSaw.push(m));

  app.send(treeMessage([]));
  hot._emit(HOT_EVENT, hot.sent[0].data);

  expect(panelSaw).toHaveLength(1);
});

test('unsubscribing stops delivery', () => {
  const hot = fakeHot();
  const cb = vi.fn();
  const off = createHotTransport(hot).onMessage?.(cb);
  off?.();

  hot._emit(HOT_EVENT, { source: 'runespect', kind: 'request', __rsFrom: 'x' });

  expect(cb).not.toHaveBeenCalled();
});
