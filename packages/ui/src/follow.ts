import {
  historyRequestMessage,
  requestMessage,
  type HelloMessage,
  type ToPageMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';
import { hearHello, latestAt, type Source } from './sources';

// Which page the panel follows, and everything that follows from it: what it shows, whom it asks,
// and when the view must drop what it holds. One dev server is one channel, so every page it serves
// says hello on the same bus. The rule lives here, as a sequence of steps a test can play, because
// the order of those steps is what is easy to get wrong.

/** What the followed page said in its hello. Forgotten when the panel follows another page. */
export interface PageFacts {
  version: number | null;
  tier: 0 | 2 | null;
  problem: string | null;
  openInEditor: boolean;
}

/** Why the panel follows the page it follows, which decides what may take the panel from it. */
export type Why = 'picked' | 'url' | 'first';

export type Focus =
  | { readonly kind: 'none' }
  /** Opened for a url that no page has said hello at yet. */
  | { readonly kind: 'waiting'; readonly url: string }
  | { readonly kind: 'following'; readonly id: string; readonly why: Why };

export interface Following {
  readonly sources: readonly Source[];
  readonly focus: Focus;
  /** The url to come back to after a reload; the view saves it. */
  readonly rememberedUrl: string | null;
  readonly page: PageFacts;
  /** Opened for one url: follow only the page at it, and go with that page when it navigates. */
  readonly waitForUrl: boolean;
}

export const followedIdOf = (state: Following): string | null =>
  state.focus.kind === 'following' ? state.focus.id : null;

export type FollowEvent =
  | { type: 'heard'; msg: ToPanelMessage }
  | { type: 'pick'; id: string }
  | { type: 'command'; msg: ToPageMessage };

export interface FollowStep {
  state: Following;
  /** A message from the followed page for the view to show. */
  deliver: ToPanelMessage | null;
  /** Already addressed to the followed page. */
  send: ToPageMessage[];
  /** The panel stopped following the page it showed: the view drops its tree and history. */
  switched: boolean;
}

const unknownPage = (): PageFacts => ({
  version: null,
  tier: null,
  problem: null,
  openInEditor: true,
});

// Before it knows anyone, the panel asks every page who is there; the hellos answer that.
export function startFollowing(opts: {
  rememberedUrl: string | null;
  waitForUrl: boolean;
}): FollowStep {
  const state: Following = {
    sources: [],
    focus: choose([], opts.rememberedUrl, opts.waitForUrl),
    rememberedUrl: opts.rememberedUrl,
    page: unknownPage(),
    waitForUrl: opts.waitForUrl,
  };
  return {
    state,
    deliver: null,
    send: [requestMessage(), historyRequestMessage(0)],
    switched: false,
  };
}

// A step that changes nothing but the state it carries.
const quiet = (state: Following): FollowStep => ({
  state,
  deliver: null,
  send: [],
  switched: false,
});

export function follow(state: Following, event: FollowEvent, now: number): FollowStep {
  if (event.type === 'command') {
    return { state, deliver: null, send: [addressed(state, event.msg)], switched: false };
  }
  if (event.type === 'pick') {
    const picked = state.sources.find((s) => s.id === event.id);
    if (!picked || picked.id === followedIdOf(state)) return quiet(state);
    return refocus(state, {
      ...state,
      focus: { kind: 'following', id: picked.id, why: 'picked' },
      rememberedUrl: picked.url ?? null,
    });
  }

  const msg = event.msg;
  // A hello from anyone is how the panel learns a page exists, so it is tracked before the filter.
  // The followed page saying hello under a new url has navigated on the client: that url is now the
  // one to come back to, so the panel goes with it. Another page it already knows only updates the
  // list: pages say hello on their own when they navigate or retitle, and that must not take the
  // panel away from the page it follows. A new page at the url (a reload) still does.
  const heard = msg.kind === 'hello' ? heardHello(state, msg, now) : quiet(state);
  if (!belongsToFollowed(msg, heard.state)) return heard;
  if (msg.kind !== 'hello') return { ...heard, deliver: msg };
  const page: PageFacts = {
    version: msg.version,
    tier: msg.tier ?? heard.state.page.tier,
    problem: msg.problem ?? null,
    openInEditor: msg.openInEditor !== false,
  };
  return { ...heard, state: { ...heard.state, page } };
}

function heardHello(state: Following, msg: HelloMessage, now: number): FollowStep {
  const { sources, heard: change } = hearHello(state.sources, msg, now);
  const next = { ...state, sources };
  if (!change) return quiet(next);
  const id = followedIdOf(state);
  if (change.type === 'refreshed' && id && change.id !== id) return quiet(next);
  const navigatedTo = change.id === id && state.rememberedUrl ? msg.url : undefined;
  return rechoose(state, { ...next, rememberedUrl: navigatedTo ?? state.rememberedUrl });
}

// A pick holds while its page is listed, which is always: nothing leaves the list.
function rechoose(before: Following, next: Following): FollowStep {
  if (next.focus.kind === 'following' && next.focus.why === 'picked') return quiet(next);
  return refocus(before, {
    ...next,
    focus: choose(next.sources, next.rememberedUrl, next.waitForUrl),
  });
}

// The page to follow, in order of respect for what the user meant (a pick is kept by rechoose):
//   1. the url they were following before — a reload gives a new id, so the url is what survives
//   2. the first page we heard from, or the newest at its url
// A panel opened for a url (`waitForUrl`) follows nothing else while it waits: a page reads nothing
// until a panel asks it by name, and asking another would wake it.
function choose(
  sources: readonly Source[],
  rememberedUrl: string | null,
  waitForUrl: boolean,
): Focus {
  if (rememberedUrl) {
    const byUrl = latestAt(sources, rememberedUrl);
    if (byUrl) return { kind: 'following', id: byUrl.id, why: 'url' };
    if (waitForUrl) return { kind: 'waiting', url: rememberedUrl };
  }
  const first = sources[0];
  if (!first) return { kind: 'none' };
  const id = first.url ? (latestAt(sources, first.url) ?? first).id : first.id;
  return { kind: 'following', id, why: 'first' };
}

// Following a new page asks it for its tree (it answers with its hello too) and for what happened
// before the panel connected.
function refocus(before: Following, next: Following): FollowStep {
  const was = followedIdOf(before);
  if (followedIdOf(next) === was) return quiet(next);
  const switched = was !== null;
  const state = { ...next, page: switched ? unknownPage() : next.page };
  return {
    state,
    deliver: null,
    send: [addressed(state, requestMessage()), addressed(state, historyRequestMessage(0))],
    switched,
  };
}

// What the followed page did not say is not the panel's to show. A message without a sender (the
// extension's names-only walk, already routed by tab) belongs to whatever page is followed. A panel that
// waits for its url shows nothing; one that follows nothing yet shows what it hears, since after a
// reconnect a page sends its tree before its hello.
function belongsToFollowed(msg: { from?: string }, state: Following): boolean {
  if (state.focus.kind === 'following') return !msg.from || msg.from === state.focus.id;
  return state.focus.kind === 'none';
}

// On a shared dev-server channel every page hears every command, so an unaddressed edit lands in
// every open tab.
function addressed(state: Following, msg: ToPageMessage): ToPageMessage {
  const id = followedIdOf(state);
  return id ? { ...msg, to: id } : msg;
}
