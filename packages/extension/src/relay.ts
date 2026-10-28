import {
  isRunespectMessage,
  isToPanel,
  isToPage,
  eventsMessage,
} from '@runespect/agent/protocol/internal';
import { createMirror } from './mirror.js';

interface RelayWindow {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, targetOrigin: string): void;
}

interface RelayRuntime {
  /** Unset once the extension has been reloaded or removed and this content script is orphaned. */
  readonly id?: string;
  sendMessage(message: unknown): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
}

// Content-script relay: bridges the page (window.postMessage) and the extension
// (chrome.runtime). Pure + injectable (win, runtime) so it can be unit-tested without a browser.
//
// What crosses in each direction is taken from the protocol's own direction lists rather than
// restated here. A hand-kept copy would drift, and a kind missing from it would silently disable the
// version handshake, the tier status or lazy value-inspection — in the extension only, never in the
// in-page overlay.
export function startRelay(win: RelayWindow, runtime: RelayRuntime): () => void {
  // The relay runs in the isolated content-script world, which shares the DOM with the page but not
  // its JS context — so it cannot write window.__runespect itself. It posts its buffer to the main
  // world instead, where the agent absorbs it into the shared timeline (see
  // docs/reference/event-log.md). Only what is new: the page lives exactly as long as this relay.
  const events = createMirror({
    send: (fresh) => win.postMessage(eventsMessage(fresh), '*'),
    deliver: 'fresh',
  }).log('relay');

  const onWindow = (event: MessageEvent) => {
    // Any frame on the page can postMessage this window; only the page itself speaks for it.
    if (event.source !== win) return;
    const msg = event.data;
    // Page → extension: everything the panel is allowed to handle.
    if (isRunespectMessage(msg) && isToPanel(msg)) {
      events.record('tx', { kind: msg.kind });
      // After the extension is reloaded, a stale content script's chrome.runtime is dead and every
      // sendMessage throws "Extension context invalidated". Tear down quietly instead of flooding
      // the page console — the freshly-injected relay (on the next page reload) takes over. Any
      // other refusal concerns one message, and the next may well go through.
      try {
        runtime.sendMessage(msg);
      } catch (error) {
        if (!runtime.id) return teardown();
        events.record('drop', { kind: msg.kind, error: String(error) });
      }
    }
  };
  const onRuntime = (msg: unknown) => {
    // Extension → page: everything the agent is allowed to handle.
    if (!isRunespectMessage(msg) || !isToPage(msg)) return;
    events.record('rx', { kind: msg.kind });
    win.postMessage(msg, '*');
  };

  const teardown = (): void => {
    win.removeEventListener('message', onWindow);
    runtime.onMessage.removeListener(onRuntime);
  };

  win.addEventListener('message', onWindow);
  runtime.onMessage.addListener(onRuntime);

  return teardown;
}
