import {
  treeMessage,
  opsMessage,
  isControl,
  isRunespectMessage,
  isToPage,
  pickedMessage,
  hydrateMessage,
  helloMessage,
  historyMessage,
  type SourceIdentity,
  type ToPanelMessage,
  PROTOCOL_VERSION,
  TIER0_FLAG,
  type Message,
  type Transport,
} from './protocol/internal';
import { commitsSince, historyTruncated } from './history';
import { publishSurface } from './surface';
import { absorbForeign, record, sizeOf } from './observe';
import { highlight, logNode, startPick, stopPick, storeGlobal } from './page-actions';
import { activate, inspectPath, serialize, watchFlushes, WIRE_DEPTH } from './wire.svelte';
import { setValue } from './tree.svelte';

/** A per-instance id: random + time, so two never collide in any realm. */
const newInstanceId = (): string => `${Math.random().toString(36).slice(2)}-${Date.now()}`;

// Who this page is, for a panel that can hear several. New per page load by design: a reload is a
// new agent with a new tree, and pretending otherwise would let a panel keep following a page that
// no longer exists. The url is what survives a reload, which is why the panel remembers that.
const SOURCE_ID = newInstanceId();
// A query can carry an OAuth code or a token, and the hello reaches every client of the dev server.
// The parameter stays, so pages still tell apart; a secret-looking one loses its value.
const SECRET_PARAM =
  /^(code|state|token|.*_token|.*secret.*|.*password.*|key|api_?key|sig|signature)$/i;
function redactQuery(search: string): string {
  if (!search) return '';
  const parts = search
    .slice(1)
    .split('&')
    .map((part) => {
      const [name] = part.split('=');
      return SECRET_PARAM.test(decodeURIComponent(name)) && part.includes('=') ? `${name}=…` : part;
    });
  return `?${parts.join('&')}`;
}

// runespect({ openInEditor: false }) sets this before the agent connects. State, because the overlay
// reads it straight from here and can be mounted before the plugin's module runs.
const editorLinks = $state({ on: true });

/** Whether the panels offer Open in editor. They hear it in the hello; the overlay reads it here. */
export function setOpenInEditor(on: boolean): void {
  editorLinks.on = on;
}

export function openInEditor(): boolean {
  return editorLinks.on;
}

function identity(): SourceIdentity {
  if (typeof location === 'undefined') return {};
  return {
    url: `${location.pathname}${redactQuery(location.search)}`,
    title: typeof document === 'undefined' ? undefined : document.title,
  };
}

// Every live connection, so reset() can end them.
const connections = new Set<() => void>();

// Wire the agent to a transport (in-app, window.postMessage, or extension messaging):
// push a tree snapshot whenever the store changes, and apply incoming edit commands.
// Returns a disconnect function.
export function connect(transport: Transport): () => void {
  // A late-connecting panel (or one that asked via `request`) gets a full snapshot; after
  // that, only deltas go over the wire.
  let first = true;
  publishSurface();
  record('connect');

  // A transport throws on anything it can't copy. dehydrate() encodes or stubs the known offenders,
  // but an unforeseen one must not take the devtools down with it — and must not surface as an
  // uncaught error in the inspected app's own console. Report it once per connection and keep
  // going: the next update may well be fine.
  let warnedUnsendable = false;
  // Typed to the direction the agent actually sends, which is also what carries `from`.
  const send = (message: ToPanelMessage): void => {
    try {
      // Stamped with who we are so a panel hearing several pages can keep to the one it follows.
      transport.send({ ...message, from: SOURCE_ID });
      record('tx', { kind: message.kind, ...sizeOf(message) });
    } catch (e) {
      record('drop', { kind: message.kind, error: String(e) });
      if (warnedUnsendable) return;
      warnedUnsendable = true;
      console.warn('[runespect] dropped an update the transport refused:', e);
    }
  };

  const sendSnapshot = (): void => {
    send(treeMessage(serialize(WIRE_DEPTH)));
    first = false;
  };

  // Tier 0: this tree comes from the app's own instrumentation, so the panel can offer edits,
  // highlighting and the picker. Announced on connect rather than only when asked — a panel that
  // was already open sent its one `request` before this page existed, and would otherwise show a
  // live Tier-0 app as Tier 1 forever.
  const announce = (): void =>
    send(
      helloMessage(PROTOCOL_VERSION, 0, {
        ...identity(),
        ...(editorLinks.on ? {} : { openInEditor: false as const }),
      }),
    );

  // Nothing is sent as the app changes until a panel asks: then this transport follows every flush.
  let stop: (() => void) | null = null;
  const follow = (): void => {
    activate();
    stop ??= watchFlushes((tree, ops, commit) => {
      if (first) {
        send(treeMessage(tree()));
        first = false;
      } else if (commit) send(opsMessage(ops, commit.seq, commit.t));
    });
  };
  const off = transport.onMessage?.((msg: Message) => {
    if (!isRunespectMessage(msg)) return;
    record('rx', { kind: msg.kind });
    // The agent only handles panel→page messages. This narrows `msg` to ToPageMessage, so adding a
    // case for a page→panel kind (e.g. `hello`) is a COMPILE error — which blocks the echo loop:
    // the window transport feeds the agent its own page→panel sends, which it must ignore.
    if (!isToPage(msg)) return;
    // Addressed to another page: on a shared dev-server channel every page hears every command, so
    // acting on one meant for a different tab would edit the wrong app's state.
    if (msg.to && msg.to !== SOURCE_ID) return;
    if (msg.kind === 'edit') setValue(msg.id, msg.symbol, msg.value, msg.path ?? []);
    else if (msg.kind === 'request') {
      // A panel asks every page who is there before it picks one, and a hello answers that. Asked by
      // name, or by a panel this transport already serves (a reconnect), the page sends its tree.
      if (msg.to || stop) {
        follow();
        sendSnapshot();
      }
      announce();
    } else if (msg.kind === 'highlight') highlight(msg.id);
    else if (msg.kind === 'pick') {
      if (msg.active) startPick((id) => send(pickedMessage(id)));
      else stopPick();
    } else if (msg.kind === 'log') logNode(msg.id);
    else if (msg.kind === 'storeGlobal') storeGlobal(msg.id, msg.symbol);
    else if (msg.kind === 'history-request')
      send(historyMessage(commitsSince(msg.since), historyTruncated()));
    else if (msg.kind === 'inspect')
      send(hydrateMessage(msg.id, msg.path, inspectPath(msg.id, msg.path, msg.limit)));
  });
  announce();

  // A panel that goes away mid-pick (DevTools closed, the socket dropped) must not leave the page
  // swallowing its next click under a highlight nobody asked for.
  const disconnect = (): void => {
    if (!connections.delete(disconnect)) return;
    stop?.();
    if (off) off();
    stopPick();
    highlight(null);
  };
  connections.add(disconnect);
  return disconnect;
}

// Dev convenience: broadcast the tree over window.postMessage so a content script or
// extension can relay it — zero app code needed. No-op on the server. Returns a
// disconnect function.
export function broadcast(): () => void {
  if (typeof window === 'undefined') return () => {};
  // Signal that the rich Tier-0 broadcaster owns this page so the Tier-1 DOM-walk fallback
  // (content-main) stays quiet — otherwise its stateless tree would clobber ours in the panel.
  (window as unknown as Record<string, unknown>)[TIER0_FLAG] = true;
  const stop = connect(createWindowTransport(window));
  const offEvents = listenForForeignEvents(window);
  return () => {
    offEvents();
    stop();
  };
}

// Hops that cannot reach the page's main world (the content-script relay, and the panel via the
// relay) post their buffers here instead, as a control message: diagnostics, not part of the tree
// conversation.
function listenForForeignEvents(win: Window): () => void {
  const handler = (e: MessageEvent): void => {
    if (e.source !== win) return; // only the page itself, as for every other window channel
    if (isControl(e.data) && e.data.kind === 'events') absorbForeign(e.data.events);
  };
  win.addEventListener('message', handler);
  return () => win.removeEventListener('message', handler);
}

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

export function resetTransport(): void {
  for (const disconnect of [...connections]) disconnect();
  editorLinks.on = true;
}
