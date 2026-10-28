import { test, expect, vi } from 'vitest';
import { startRelay } from '../../../packages/extension/src/relay';
import { reconnectingPort } from '../../../packages/extension/src/panel-port';
import { absorbExpression, type RunespectEvent } from '@runespect/agent/protocol/internal';

function mockWindow() {
  const listeners: ((e: { data: unknown; source: unknown }) => void)[] = [];
  const win = {
    sent: [] as unknown[],
    addEventListener: (type: string, l: (e: { data: unknown }) => void) =>
      type === 'message' && listeners.push(l),
    removeEventListener: () => {},
    postMessage(m: unknown) {
      this.sent.push(m);
    },
    _emit: (data: unknown) => listeners.forEach((l) => l({ data, source: win })),
  };
  return win;
}
function mockRuntime() {
  const listeners: ((m: unknown) => void)[] = [];
  return {
    sent: [] as unknown[],
    sendMessage(m: unknown) {
      this.sent.push(m);
    },
    onMessage: {
      addListener: (l: (m: unknown) => void) => listeners.push(l),
      removeListener: () => {},
    },
    _emit: (m: unknown) => listeners.forEach((l) => l(m)),
  };
}

// The relay lives in the isolated content-script world, which cannot touch window.__runespect
// directly — it posts its events to the main world, where the agent absorbs them.
test('the relay records what it forwards and publishes it to the page', async () => {
  const win = mockWindow();
  const runtime = mockRuntime();
  startRelay(win as any, runtime as any);

  win._emit({ source: 'runespect', kind: 'tree', nodes: [] });
  await Promise.resolve(); // publishing is batched into a microtask, one post per burst

  const posted = win.sent.find((m: any) => m?.source === 'runespect' && m.kind === 'events') as
    { events: RunespectEvent[] } | undefined;
  expect(posted).toBeTruthy();
  expect(posted!.events.some((e) => e.hop === 'relay' && e.ev === 'tx' && e.kind === 'tree')).toBe(
    true,
  );
});

// When MV3 retires the service worker the port dies; that must leave a trace.
test('a port reconnect is recorded, so the silence has a trace', () => {
  const ports: any[] = [];
  const connect = vi.fn(() => {
    const listeners: any[] = [];
    const disconnects: any[] = [];
    const p = {
      sent: [] as unknown[],
      postMessage(m: unknown) {
        this.sent.push(m);
      },
      onMessage: { addListener: (cb: any) => listeners.push(cb) },
      onDisconnect: { addListener: (cb: any) => disconnects.push(cb) },
      _drop: () => disconnects.forEach((d) => d()),
    };
    ports.push(p);
    return p as any;
  });

  const transport = reconnectingPort({ connect, tabId: 7 });
  ports[0]._drop();

  const evs = transport.events();
  expect(evs.some((e) => e.hop === 'panel-port' && e.ev === 'connect')).toBe(true);
  expect(evs.some((e) => e.hop === 'panel-port' && e.ev === 'disconnect')).toBe(true);
  expect(evs.some((e) => e.hop === 'panel-port' && e.ev === 'reconnect')).toBe(true);
  transport.close();
});

// The panel cannot touch the page's globals; it evaluates this expression in the inspected page.
test('the absorb expression hands the events to the agent, and is harmless without one', () => {
  const absorbed: unknown[] = [];
  const events = [{ t: 1, seq: 0, hop: 'panel' as const, ev: 'connect' as const }];
  const run = (window: unknown) => new Function('window', absorbExpression(events))(window);

  run({ __runespect: { absorb: (e: unknown) => absorbed.push(e) } });
  expect(absorbed).toEqual([events]);
  expect(() => run({})).not.toThrow();
});
