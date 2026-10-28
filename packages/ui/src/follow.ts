import {
  historyRequestMessage,
  requestMessage,
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
  /** Opened for one url: follow nothing else until it says hello. */
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

export function follow(state: Following, event: FollowEvent, now: number): FollowStep {
  if (event.type === 'command') {
    return { state, deliver: null, send: [addressed(state, event.msg)], switched: false };
  }
  if (event.type === 'pick') {
    if (event.id === state.followedId) return { state, deliver: null, send: [], switched: false };
    const url = state.sources.find((s) => s.id === event.id)?.url ?? null;
    return refollow(state, { ...state, chosenId: event.id, rememberedUrl: url });
  }

  const msg = event.msg;
  // A hello from anyone is how the panel learns a page exists, so it is tracked before the filter.
  const heard =
    msg.kind === 'hello'
      ? refollow(state, { ...state, sources: trackSources(state.sources, msg, now) })
      : { state, deliver: null, send: [], switched: false };
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

// Re-choose after the known pages or the choice changed. Following a new page asks it for its tree
// (it answers with its hello too) and for what happened before the panel connected.
function refollow(before: Following, next: Following): FollowStep {
  const followedId = chooseSource(next.sources, next.chosenId, next.rememberedUrl, {
    waitForUrl: next.waitForUrl,
  });
  if (followedId === before.followedId) {
    return { state: { ...next, followedId }, deliver: null, send: [], switched: false };
  }
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
// extension's Tier-1 walk, already routed by tab) belongs to whatever page is followed. A panel that
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
