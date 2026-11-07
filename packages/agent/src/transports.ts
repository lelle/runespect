import type { Message, Transport } from './protocol/internal';

/** A per-instance id: random + time, so two never collide in any realm. */
export const newInstanceId = (): string => `${Math.random().toString(36).slice(2)}-${Date.now()}`;

// Both channels hand a sender its own messages back: window.postMessage delivers to the same
// window's listeners, and the dev server rebroadcasts to every client. Without this a transport
// would receive (and potentially re-handle) what it just sent, which would loop a handshake
// forever. Each transport tags its sends with an id of its own and drops what carries it. A random
// id is realm-safe (page main-world agent vs content-script use separate module copies).
function echoTag(): { tag: (message: Message) => Message; isOwn: (data: unknown) => boolean } {
  const selfId = newInstanceId();
  return {
    tag: (message) => ({ ...message, __rsFrom: selfId }),
    isOwn: (data) => (data as { __rsFrom?: string } | null)?.__rsFrom === selfId,
  };
}

// Page-side transport over window.postMessage (the page → content-script boundary).
export function createWindowTransport(win: Window | typeof globalThis = globalThis): Transport {
  const echo = echoTag();
  return {
    send: (message) => win.postMessage(echo.tag(message), '*'),
    onMessage: (cb) => {
      const handler = (e: MessageEvent): void => {
        // Any frame can postMessage this window; only the window itself speaks for the page.
        if (e.source !== win) return;
        if (echo.isOwn(e.data)) return;
        cb(e.data);
      };
      win.addEventListener('message', handler);
      return () => win.removeEventListener('message', handler);
    },
  };
}

// ── the dev-server channel ──
// Vite's own HMR socket carries our messages between the app page and the standalone panel window
// the plugin serves at /__runespect/. No new port and no new dependency — and it is already wss
// when the app runs over https, which a separate ws:// server could not be.

/** The single event name both ends use on the HMR channel. */
export const HOT_EVENT = 'runespect:msg';

/** The shape of `import.meta.hot` we rely on. */
export interface HotChannel {
  send(event: string, data?: unknown): void;
  on(event: string, cb: (data: unknown) => void): void;
  off?(event: string, cb: (data: unknown) => void): void;
}

export function createHotTransport(hot: HotChannel): Transport {
  // WHICH PAGE a message belongs to is a different question from the echo, answered by `from` and
  // decided by the panel (ui/sources.ts): a transport that bound itself to one peer would hide the
  // others before they could be offered.
  const echo = echoTag();
  return {
    send: (message) => hot.send(HOT_EVENT, echo.tag(message)),
    onMessage: (cb) => {
      // `off` is optional on the channel, so unsubscribing must hold on its own: the flag is what
      // guarantees delivery stops, and off() is the cleanup that avoids leaking the handler.
      let stopped = false;
      const handler = (data: unknown): void => {
        if (stopped) return;
        if (echo.isOwn(data)) return;
        cb(data as Message);
      };
      hot.on(HOT_EVENT, handler);
      return () => {
        stopped = true;
        hot.off?.(HOT_EVENT, handler);
      };
    },
  };
}

/**
 * The hot channel's shape between the documents of one origin, for a build: no dev server, and the
 * browser delivers to every other document, as Vite's broker does.
 */
export function pageChannel(): HotChannel {
  const channel = new BroadcastChannel(HOT_EVENT);
  const handlers = new Map<(data: unknown) => void, (event: MessageEvent) => void>();
  return {
    send: (event, data) => channel.postMessage({ event, data }),
    on(event, cb) {
      const handler = (e: MessageEvent): void => {
        if (e.data?.event === event) cb(e.data.data);
      };
      handlers.set(cb, handler);
      channel.addEventListener('message', handler);
    },
    off(_, cb) {
      const handler = handlers.get(cb);
      if (handler) channel.removeEventListener('message', handler);
      handlers.delete(cb);
    },
  };
}
