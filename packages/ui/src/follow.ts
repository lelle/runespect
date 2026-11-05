import {
  historyRequestMessage,
  requestMessage,
  type HelloMessage,
  type ToPageMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';
import { chooseSource, trackSources, type Source } from './sources';

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

export interface Following {
  readonly sources: readonly Source[];
  readonly followedId: string | null;
  /** The url to come back to after a reload; the view saves it. */
  readonly rememberedUrl: string | null;
  readonly page: PageFacts;
  readonly chosenId: string | null;
  /** Opened for one url: follow only the page at it, and go with that page when it navigates. */
  readonly waitForUrl: boolean;
}

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
    followedId: null,
    rememberedUrl: opts.rememberedUrl,
    page: unknownPage(),
    chosenId: null,
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
    if (event.id === state.followedId) return quiet(state);
    const url = state.sources.find((s) => s.id === event.id)?.url ?? null;
    return refollow(state, { ...state, chosenId: event.id, rememberedUrl: url });
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
  const sources = trackSources(state.sources, msg, now);
  const known = state.sources.some((s) => s.id === msg.from);
  if (known && state.followedId && msg.from !== state.followedId) {
    return quiet({ ...state, sources });
  }
  const navigatedTo = msg.from === state.followedId && state.rememberedUrl ? msg.url : undefined;
  return refollow(state, { ...state, sources, rememberedUrl: navigatedTo ?? state.rememberedUrl });
}

// Re-choose after the known pages or the choice changed. Following a new page asks it for its tree
// (it answers with its hello too) and for what happened before the panel connected.
function refollow(before: Following, next: Following): FollowStep {
  const followedId = chooseSource(next.sources, next.chosenId, next.rememberedUrl, {
    waitForUrl: next.waitForUrl,
  });
  if (followedId === before.followedId) return quiet({ ...next, followedId });
  const switched = before.followedId !== null;
  const state = { ...next, followedId, page: switched ? unknownPage() : next.page };
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
  if (state.followedId) return !msg.from || msg.from === state.followedId;
  return !state.waitForUrl;
}

// On a shared dev-server channel every page hears every command, so an unaddressed edit lands in
// every open tab.
function addressed(state: Following, msg: ToPageMessage): ToPageMessage {
  return state.followedId ? { ...msg, to: state.followedId } : msg;
}
