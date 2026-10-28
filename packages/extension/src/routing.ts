import {
  createEventLog,
  eventsMessage,
  isControl,
  isRunespectMessage,
  isToPage,
  isToPanel,
  PANEL_PORT,
} from '@runespect/agent/protocol/internal';
import { createMirror } from './mirror.js';

interface PortLike {
  name: string;
  postMessage(message: unknown): void;
  onMessage: { addListener(callback: (message: unknown) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
}

interface RuntimeLike {
  onConnect: { addListener(callback: (port: PortLike) => void): void };
  onMessage: {
    addListener(callback: (message: unknown, sender: { tab?: { id?: number } }) => void): void;
  };
}

interface TabsLike {
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

// The service worker's routing between a tab's devtools panel and that tab's page, by tabId. A panel
// registers its tab with a `register` message; from then on its messages go to that tab's page, and
// that page's messages come back to it. Injectable (runtime, tabs) so it can be tested without a browser.
//
// Where a message cannot be delivered is where the panel goes quiet, so the worker records it and
// hands its log to the panel, which mirrors it into the page (docs/reference/event-log.md).
export function startRouting(runtime: RuntimeLike, tabs: TabsLike): void {
  const panelsByTab = new Map<number, PortLike>();
  const events = createEventLog('background');

  runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT) return;
    let tabId: number | undefined;
    // The whole log each time: the panel may have reconnected, and the page behind it reloaded.
    const mirror = createMirror({
      send: (all) => port.postMessage(eventsMessage(all)),
      deliver: 'whole',
    });
    mirror.include(() => events.events);

    port.onMessage.addListener((message) => {
      if (isControl(message) && message.kind === 'register') {
        tabId = message.tabId;
        panelsByTab.set(tabId, port);
        return;
      }
      // Only what a page may handle goes to the page, as in the content-script relay.
      if (tabId == null || !isRunespectMessage(message) || !isToPage(message)) return;
      const { kind } = message;
      // Chrome rejects the send when the tab has no content script: a tab opened before the
      // extension was installed or reloaded, a chrome:// page, the Web Store.
      tabs.sendMessage(tabId, message).catch((error: unknown) => {
        events.record('drop', { kind, error: String(error) });
        mirror.poke();
      });
    });

    // A panel closed and reopened fast can disconnect after its successor registered.
    port.onDisconnect.addListener(() => {
      if (tabId != null && panelsByTab.get(tabId) === port) panelsByTab.delete(tabId);
    });
  });

  runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null || !isRunespectMessage(message) || !isToPanel(message)) return;
    panelsByTab.get(tabId)?.postMessage(message);
  });
}
