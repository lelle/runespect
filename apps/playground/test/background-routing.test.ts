import { test, expect } from 'vitest';
import { PANEL_PORT, registerMessage } from '@runespect/agent/protocol/internal';
import { startRouting } from '../../../packages/extension/src/routing';

// The service worker routes between the devtools panel of a tab and that tab's page.
// Fakes for chrome.runtime and chrome.tabs, as JSON-copying as
// the real ones.
function fakePort() {
  const messages: ((m: unknown) => void)[] = [];
  const disconnects: (() => void)[] = [];
  return {
    name: PANEL_PORT,
    sent: [] as any[],
    postMessage(m: unknown) {
      this.sent.push(JSON.parse(JSON.stringify(m)));
    },
    onMessage: { addListener: (cb: (m: unknown) => void) => messages.push(cb) },
    onDisconnect: { addListener: (cb: () => void) => disconnects.push(cb) },
    _send: (m: unknown) => messages.forEach((cb) => cb(m)),
    _drop: () => disconnects.forEach((cb) => cb()),
  };
}

function worker(receiving = true) {
  let onConnect: (port: any) => void = () => {};
  let onMessage: (m: unknown, sender: any) => void = () => {};
  const toTabs: { tabId: number; message: any }[] = [];
  startRouting(
    {
      onConnect: { addListener: (cb) => (onConnect = cb) },
      onMessage: { addListener: (cb) => (onMessage = cb) },
    },
    {
      sendMessage: async (tabId, message) => {
        if (!receiving)
          throw new Error('Could not establish connection. Receiving end does not exist.');
        toTabs.push({ tabId, message });
      },
    },
  );
  const panel = (tabId: number, registration: unknown = registerMessage(tabId)) => {
    const port = fakePort();
    onConnect(port);
    port._send(registration);
    return port;
  };
  const fromPage = (tabId: number, message: unknown) => onMessage(message, { tab: { id: tabId } });
  return { panel, fromPage, toTabs };
}

const tree = { source: 'runespect', kind: 'tree', nodes: [] };

test('a page message reaches the panel of its own tab, and a panel message its own page', async () => {
  const w = worker();
  const p3 = w.panel(3);
  const p4 = w.panel(4);
  w.fromPage(3, tree);
  p4._send({ source: 'runespect', kind: 'request' });
  await Promise.resolve();
  expect(p3.sent).toContainEqual(tree);
  expect(p4.sent).not.toContainEqual(tree);
  expect(w.toTabs).toEqual([{ tabId: 4, message: { source: 'runespect', kind: 'request' } }]);
});

// DevTools closed and reopened fast: the old port's disconnect can arrive after the new panel has
// registered, and must not unregister it.
test('an old panel that disconnects late does not unregister the new one', () => {
  const w = worker();
  const old = w.panel(3);
  const fresh = w.panel(3);
  old._drop();
  w.fromPage(3, tree);
  expect(fresh.sent).toContainEqual(tree);
});

test('a registration without a numeric tab is ignored', () => {
  const w = worker();
  const p = w.panel(3, { ...registerMessage(3), tabId: '3' });
  w.fromPage(3, tree);
  expect(p.sent).not.toContainEqual(tree);
});

// A tab opened before the extension was installed has no content script; the panel is told so,
// and the worker does not reject.
test('a page that cannot hear the panel is reported to that panel', async () => {
  const w = worker(false);
  const p = w.panel(3);
  p._send({ source: 'runespect', kind: 'request' });
  await new Promise((r) => setTimeout(r, 0));
  const events = p.sent.find((m) => m.kind === 'events');
  expect(events.events).toContainEqual(
    expect.objectContaining({ hop: 'background', ev: 'drop', kind: 'request' }),
  );
});

// A panel registers with a message of its own. A hello is what a page says about itself, not a
// registration.
test('a hello from a panel does not register it', () => {
  const w = worker();
  const p = w.panel(3, { source: 'runespect', kind: 'hello', tabId: 3 });
  w.fromPage(3, tree);
  expect(p.sent).not.toContainEqual(tree);
});

// The relay already lets through only what each side may handle; the worker holds to the same, so a
// message that is not runespect's, or goes the wrong way, stops here too.
test('a panel reaches its page only with what a page may handle', async () => {
  const w = worker();
  const p = w.panel(3);
  p._send({ source: 'runespect', kind: 'exec', code: 'alert(1)' });
  p._send({ source: 'elsewhere', kind: 'request' });
  p._send(tree);
  p._send({ source: 'runespect', kind: 'request' });
  await Promise.resolve();
  expect(w.toTabs).toEqual([{ tabId: 3, message: { source: 'runespect', kind: 'request' } }]);
});

test('a page reaches its panel only with what a panel may handle', () => {
  const w = worker();
  const p = w.panel(3);
  w.fromPage(3, { source: 'runespect', kind: 'request' });
  w.fromPage(3, { source: 'elsewhere', kind: 'tree', nodes: [] });
  w.fromPage(3, tree);
  expect(p.sent).toEqual([tree]);
});
