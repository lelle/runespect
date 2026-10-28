import {
  registerMessage,
  requestMessage,
  createEventLog,
  type Message,
  type RunespectEvent,
  type Transport,
} from '@runespect/agent/protocol/internal';

/** How often the panel pokes the port so MV3 doesn't tear the service worker down under it. */
export const KEEPALIVE_MS = 20_000;

interface PortLike {
  postMessage(m: unknown): void;
  disconnect?(): void;
  onMessage: { addListener(cb: (m: Message) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

export interface ReconnectingPortOptions {
  connect: () => PortLike;
  /** The inspected tab, which the background uses to route page messages back to this panel. */
  tabId: number;
}

// The panel's transport to the background service worker.
//
// MV3 terminates an idle service worker (~30s), which drops the port and takes the background's
// tab→panel routing table with it. A panel holding one port for its lifetime therefore goes quiet
// the moment you look away — switching to the Console panel and back is enough — and only a
// DevTools reopen would bring it back. So the port is re-established on disconnect, re-registers the
// tab, and asks the page to resend rather than waiting for the next state change. A keepalive
// keeps the worker alive while the panel is merely idle, so the gap rarely happens at all.
export function reconnectingPort(
  options: ReconnectingPortOptions,
): Transport & { close: () => void; events: () => RunespectEvent[] } {
  const { connect, tabId } = options;
  // Losing the port is invisible from the outside — the tree simply stops updating — so every
  // connect/disconnect/reconnect is recorded and mirrored into the page
  // (docs/reference/event-log.md).
  const events = createEventLog('panel-port');
  const register = registerMessage(tabId);

  let port: PortLike | null = null;
  let closed = false;
  // A Set, not a slot: the debug mirror subscribes alongside <Panel>, and one would otherwise
  // silently displace the other.
  const subscribers = new Set<(m: Message) => void>();

  const post = (m: unknown): void => {
    try {
      port?.postMessage(m);
    } catch {
      /* the port died between the check and the send — the disconnect handler takes it from here */
    }
  };

  // A port that drops right after it opened is retried after a pause that grows, so a worker that
  // keeps refusing cannot spin the panel. One quick drop is normal (MV3 recycled the worker).
  let openedAt = 0;
  let quickDrops = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    closed = true;
    clearInterval(keepalive);
    clearTimeout(retry);
  };

  const open = (isReconnect: boolean): void => {
    if (closed) return;
    try {
      port = connect();
    } catch (error) {
      // After the extension is reloaded, this panel is orphaned and can never connect again.
      events.record('drop', { error: String(error) });
      return stop();
    }
    openedAt = Date.now();
    events.record(isReconnect ? 'reconnect' : 'connect', { tabId });
    port.onMessage.addListener((m) => {
      events.record('rx', { kind: (m as Message).kind });
      subscribers.forEach((cb) => cb(m));
    });
    port.onDisconnect.addListener(() => {
      port = null;
      events.record('disconnect');
      quickDrops = Date.now() - openedAt < 1000 ? quickDrops + 1 : 0;
      if (quickDrops <= 1) return open(true);
      retry = setTimeout(() => open(true), Math.min(1000 * 2 ** (quickDrops - 2), 10_000));
    });
    post(register);
    if (isReconnect) post(requestMessage()); // the tree we hold may be stale
  };

  const keepalive = setInterval(() => post(register), KEEPALIVE_MS);
  open(false);

  return {
    send: post,
    onMessage: (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    close: () => {
      stop();
      port?.disconnect?.();
    },
    events: () => events.events,
  };
}
