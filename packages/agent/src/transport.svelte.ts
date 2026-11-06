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
  byeMessage,
  type SourceIdentity,
  type ToPanelMessage,
  PROTOCOL_VERSION,
  TIER0_FLAG,
  type Commit,
  type Message,
  type Transport,
  type TreeOp,
} from './protocol/internal';
import { commitsSince, historyTruncated } from './history';
import { publishSurface } from './surface';
import { absorbForeign, record, sizeOf } from './observe';
import { highlight, logNode, startPick, stopPick, storeGlobal } from './page-actions';
import { activate, inspectPath, serialize, watchFlushes, WIRE_DEPTH } from './wire.svelte';
import { setValue } from './tree.svelte';
import { version } from '../package.json';
import { linkStep, startLink, type Link, type LinkEffect, type LinkEvent } from './link';

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
    ...(typeof document !== 'undefined' && { visible: document.visibilityState === 'visible' }),
  };
}

// A tab a panel watched keeps the id of its page in sessionStorage, which belongs to the tab and
// survives a reload, so the next page in the tab can say which page it replaces. Read once per page
// load, before any connection writes its own: a page connected twice (the extension and the dev
// server) names the page before it in both. Storage that is missing or throws names none.
const PAGE_KEY = '__runespect_page';
let pageBefore: string | null | undefined;
function previousPage(): string | null {
  if (pageBefore === undefined) {
    try {
      const found = globalThis.sessionStorage?.getItem(PAGE_KEY) ?? null;
      // A page cannot replace itself: its own id is from a connection made again in this load.
      pageBefore = found === SOURCE_ID ? null : found;
    } catch {
      pageBefore = null;
    }
  }
  return pageBefore;
}
function rememberPage(): void {
  try {
    globalThis.sessionStorage?.setItem(PAGE_KEY, SOURCE_ID);
  } catch {
    // Without storage the next page names none; this one still says bye.
  }
}

// Every live connection, so reset() can end them.
const connections = new Set<() => void>();

// Wire the agent to a transport (in-app, window.postMessage, or extension messaging):
// push a tree snapshot whenever the store changes, and apply incoming edit commands.
// Returns a disconnect function.
export function connect(transport: Transport): () => void {
  publishSurface();
  record('connect');

  // A transport throws on anything it can't copy. dehydrate() encodes or stubs the known offenders,
  // but an unforeseen one must not take the devtools down with it — and must not surface as an
  // uncaught error in the inspected app's own console. Report it once per connection and keep
  // going: the next update may well be fine.
  let warnedUnsendable = false;
  // Taken before the transport is called, so a send it refuses leaves a gap the panel can see.
  let sentCount = 0;
  // Typed to the direction the agent actually sends, which is also what carries `from`.
  const send = (message: ToPanelMessage): void => {
    try {
      // Stamped with who we are so a panel hearing several pages can keep to the one it follows.
      transport.send({ ...message, from: SOURCE_ID, n: ++sentCount });
      record('tx', { kind: message.kind, ...sizeOf(message) });
    } catch (e) {
      record('drop', { kind: message.kind, error: String(e) });
      if (warnedUnsendable) return;
      warnedUnsendable = true;
      console.warn('[runespect] dropped an update the transport refused:', e);
    }
  };

  // Live: this tree comes from the app's own instrumentation, so the panel can offer edits,
  // highlighting and the picker.
  const hello = (page: SourceIdentity, replaces?: string): void =>
    send(
      helloMessage(PROTOCOL_VERSION, 0, {
        ...page,
        ...(replaces && { replaces }),
        agentVersion: version,
        ...(editorLinks.on ? {} : { openInEditor: false as const }),
      }),
    );

  // link.ts decides; this carries it out. A flush's ops are only known inside the flush. The link
  // starts before the transport is listened to, which may hand over what it holds at once.
  const started = startLink(identity(), previousPage());
  let link: Link = started.link;
  let stop: (() => void) | null = null;
  let stopWatchingPage: (() => void) | null = null;
  const step = (event: LinkEvent, flushed?: { ops: TreeOp[]; commit: Commit | null }): void => {
    const next = linkStep(link, event);
    link = next.link;
    next.effects.forEach((effect) => perform(effect, flushed));
  };
  const perform = (
    effect: LinkEffect,
    flushed?: { ops: TreeOp[]; commit: Commit | null },
  ): void => {
    switch (effect.do) {
      case 'hello':
        return hello(effect.page, effect.replaces);
      case 'tree':
        return send(treeMessage(serialize(WIRE_DEPTH)));
      case 'ops':
        if (flushed?.commit) send(opsMessage(flushed.ops, flushed.commit.seq, flushed.commit.t));
        return;
      case 'follow-flushes':
        activate();
        stop ??= watchFlushes((ops, commit) =>
          step({ type: 'flush', changed: commit !== null }, { ops, commit }),
        );
        return;
      case 'watch-page':
        return watchPage();
      case 'remember':
        return rememberPage();
      case 'bye':
        return send(byeMessage());
      case 'stop':
        stop?.();
        stopWatchingPage?.();
        stopPick();
        highlight(null);
        return;
      default: {
        const unknown: never = effect;
        return unknown;
      }
    }
  };

  // An app that navigates on the client stays the same page under a new url, and its title often
  // follows a moment later; the link says hello again so the panel lists it as it is now, and when
  // the tab is shown or hidden. The Navigation API tells of every history change without wrapping
  // the app's own history.pushState. The page going, and coming back from the back/forward cache,
  // are told by pagehide and pageshow.
  const watchPage = (): void => {
    if (stopWatchingPage || typeof document === 'undefined') return;
    // Looked at after the turn, so a navigation and the title it sets a moment later make one
    // hello; the raw url and title first, since most changes to <head> touch neither.
    let seen = '';
    const check = (): void =>
      queueMicrotask(() => {
        const raw = `${location.pathname}${location.search}\n${document.title}\n${document.visibilityState}`;
        if (raw === seen) return;
        seen = raw;
        step({ type: 'page', page: identity() });
      });
    const hidden = (): void => step({ type: 'pagehide' });
    const shown = (e: Event): void => {
      if ((e as PageTransitionEvent).persisted) step({ type: 'pageshow', page: identity() });
    };
    const navigation = (globalThis as { navigation?: EventTarget }).navigation;
    navigation?.addEventListener('currententrychange', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pagehide', hidden);
    window.addEventListener('pageshow', shown);
    const titles = new MutationObserver(check);
    titles.observe(document.head, { subtree: true, childList: true, characterData: true });
    stopWatchingPage = () => {
      navigation?.removeEventListener('currententrychange', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pagehide', hidden);
      window.removeEventListener('pageshow', shown);
      titles.disconnect();
    };
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
    else if (msg.kind === 'request') step({ type: 'request', toSelf: !!msg.to, page: identity() });
    // A ping is always for one page; one for no page in particular is not ours to answer.
    else if (msg.kind === 'ping' && msg.to) step({ type: 'ping', page: identity() });
    else if (msg.kind === 'highlight') highlight(msg.id);
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
  started.effects.forEach((effect) => perform(effect));

  // A panel that goes away mid-pick (DevTools closed, the socket dropped) must not leave the page
  // swallowing its next click under a highlight nobody asked for.
  // Commands do not go through the link, so the transport stops first: whatever fails after it,
  // a disconnected page hears nothing more.
  const disconnect = (): void => {
    if (!connections.delete(disconnect)) return;
    off?.();
    step({ type: 'disconnect' });
  };
  connections.add(disconnect);
  return disconnect;
}

// Dev convenience: broadcast the tree over window.postMessage so a content script or
// extension can relay it — zero app code needed. No-op on the server. Returns a
// disconnect function.
export function broadcast(): () => void {
  if (typeof window === 'undefined') return () => {};
  // Signal that the rich plugin broadcaster owns this page so the names-only DOM-walk fallback
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
  pageBefore = undefined;
  editorLinks.on = true;
}
