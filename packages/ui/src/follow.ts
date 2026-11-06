import {
  historyRequestMessage,
  pingMessage,
  requestMessage,
  type HelloMessage,
  type ToPageMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';
import {
  deadlines,
  hearBye,
  hearHello,
  latestAt,
  waitEnded,
  type Heard,
  type PeerStep,
  type Source,
} from './sources';

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

/** The page it followed until it went with no page after it in time: its reload takes it back. */
export type Lost = { readonly id: string; readonly why: Why };

export type Focus =
  | { readonly kind: 'none'; readonly lost?: Lost }
  /** Opened for a url that no page has said hello at yet. */
  | { readonly kind: 'waiting'; readonly url: string }
  | {
      readonly kind: 'following';
      readonly id: string;
      readonly why: Why;
      readonly lost?: Lost;
      /** Chosen while its tab was hidden: a page shown in front of the user takes its place. */
      readonly hidden?: true;
    };

export interface Following {
  readonly sources: readonly Source[];
  readonly focus: Focus;
  /** The url to come back to after a reload; the view saves it. */
  readonly rememberedUrl: string | null;
  readonly page: PageFacts;
  /** Opened for one url: follow only the page at it, and go with that page when it navigates. */
  readonly waitForUrl: boolean;
  /** Hears one tab only (the extension, routed by tab): a page that replaces another is a reload. */
  readonly oneTab: boolean;
}

export { quiet };

export const followedIdOf = (state: Following): string | null =>
  state.focus.kind === 'following' ? state.focus.id : null;

/** The rows to show: a page that said bye only while it is followed, as it may be reloading. */
export const listedSources = (state: Following): readonly Source[] =>
  state.sources.filter((s) => s.life.state !== 'left' || s.id === followedIdOf(state));

export type FollowEvent =
  | { type: 'heard'; msg: ToPanelMessage }
  | { type: 'pick'; id: string }
  | { type: 'command'; msg: ToPageMessage }
  /** A page's wait came due. */
  | { type: 'timeout'; id: string };

export interface FollowStep {
  state: Following;
  /** A message from the followed page for the view to show. */
  deliver: ToPanelMessage | null;
  /** Already addressed to the followed page. */
  send: ToPageMessage[];
  /** The panel stopped following the page it showed: the view drops its tree and history. */
  switched: boolean;
  /** When to come back with a `timeout` for a page. */
  timers: { id: string; at: number }[];
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
  oneTab?: boolean;
}): FollowStep {
  const state: Following = {
    sources: [],
    focus: choose([], opts.rememberedUrl, opts.waitForUrl),
    rememberedUrl: opts.rememberedUrl,
    page: unknownPage(),
    waitForUrl: opts.waitForUrl,
    oneTab: opts.oneTab ?? false,
  };
  return {
    state,
    deliver: null,
    send: [requestMessage(), historyRequestMessage(0)],
    switched: false,
    timers: [],
  };
}

// A step that changes nothing but the state it carries.
const quiet = (state: Following): FollowStep => ({
  state,
  deliver: null,
  send: [],
  switched: false,
  timers: [],
});

export function follow(state: Following, event: FollowEvent, now: number): FollowStep {
  if (event.type === 'command') {
    return { ...quiet(state), send: [addressed(state, event.msg)] };
  }
  if (event.type === 'pick') {
    const picked = state.sources.find((s) => s.id === event.id);
    if (!picked) return quiet(state);
    // A pick is the user's, so a page lost before it does not take the panel back.
    return refocus(state, {
      ...state,
      focus: { kind: 'following', id: picked.id, why: 'picked' },
      rememberedUrl: picked.url ?? null,
    });
  }
  if (event.type === 'timeout') return react(state, waitEnded(state.sources, event.id, now));

  const msg = event.msg;
  // A hello or a bye is how the panel learns a page came or went, so it is tracked before the filter.
  if (msg.kind === 'bye')
    return msg.from ? react(state, hearBye(state.sources, msg.from, now)) : quiet(state);
  const heard =
    msg.kind === 'hello'
      ? react(state, hearHello(state.sources, msg, now, state.oneTab), msg)
      : quiet(state);
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

// What changed in the list decides the focus. The page followed
// keeps the panel while it is there: only a page that replaces it, or the url the panel was opened
// for, takes the panel from it.
function react(state: Following, peer: PeerStep, hello?: HelloMessage): FollowStep {
  const next = { ...state, sources: peer.sources };
  const step = settle(state, next, peer.heard, hello);
  // A page asked by name in this step needs no ping.
  const asked = new Set(step.send.flatMap((m) => (m.kind === 'request' && m.to ? [m.to] : [])));
  const before = new Set(deadlines(state.sources).map((d) => `${d.id}@${d.at}`));
  return {
    ...step,
    send: [...peer.ping.filter((id) => !asked.has(id)).map(pingMessage), ...step.send],
    timers: deadlines(peer.sources).filter((d) => !before.has(`${d.id}@${d.at}`)),
  };
}

function settle(
  before: Following,
  next: Following,
  heard: Heard | null,
  hello?: HelloMessage,
): FollowStep {
  const focus = next.focus;
  if (!heard) return quiet(next);
  if (heard.type === 'left') return quiet(next);
  // A page back under its own id (from the back/forward cache) or one that replaces it.
  const isLost = (lost: Lost | undefined, arrived: { id: string; replaces?: string }) =>
    lost && (arrived.id === lost.id || arrived.replaces === lost.id);
  if (focus.kind === 'none') {
    if (heard.type === 'arrived' && focus.lost && isLost(focus.lost, heard)) {
      const why = focus.lost.why;
      return refocus(before, { ...next, focus: { kind: 'following', id: heard.id, why } });
    }
    const chosen = chooseIn(next);
    const lost = focus.lost;
    return refocus(before, { ...next, focus: lost ? withLost(chosen, lost) : chosen });
  }
  if (heard.type === 'arrived') {
    const arrived = next.sources.find((s) => s.id === heard.id)!;
    if (focus.kind === 'waiting') {
      if (arrived.url !== focus.url) return quiet(next);
      return refocus(before, { ...next, focus: { kind: 'following', id: arrived.id, why: 'url' } });
    }
    if (isLost(focus.lost, heard)) {
      return refocus(before, {
        ...next,
        focus: { kind: 'following', id: arrived.id, why: focus.lost!.why },
        rememberedUrl: moved(next, arrived),
      });
    }
    if (focus.why === 'first') {
      const atUrl = next.rememberedUrl && arrived.url === next.rememberedUrl;
      const shownOverHidden = !next.rememberedUrl && arrived.visible && focus.hidden;
      if (atUrl || shownOverHidden) {
        const why: Why = atUrl ? 'url' : 'first';
        return refocus(before, { ...next, focus: { kind: 'following', id: arrived.id, why } });
      }
    }
    return quiet(next);
  }
  if (focus.kind !== 'following') return quiet(next);
  if (heard.type === 'refreshed') {
    // The followed page under a new url has navigated on the client: that url is now the one to
    // come back to.
    if (heard.id !== focus.id) return quiet(next);
    // Shown now, so a page shown later is no reason to leave it.
    const shown = focus.hidden && hello?.visible ? { ...focus, hidden: undefined } : focus;
    const url = before.rememberedUrl ? (hello?.url ?? next.rememberedUrl) : next.rememberedUrl;
    return quiet({ ...next, focus: shown, rememberedUrl: url });
  }
  if (heard.type === 'replaced') {
    if (heard.from !== focus.id) return quiet(next);
    const successor = next.sources.find((s) => s.id === heard.to)!;
    return refocus(before, {
      ...next,
      focus: { kind: 'following', id: heard.to, why: focus.why },
      rememberedUrl: moved(next, successor),
    });
  }
  // gone
  if (heard.id !== focus.id) return quiet(next);
  return refocus(before, {
    ...next,
    focus: withLost(chooseIn(next), { id: focus.id, why: focus.why }),
  });
}

// A waiting focus has its url to come back to; any other keeps the page it lost.
const withLost = (focus: Focus, lost: Lost): Focus =>
  focus.kind === 'waiting' ? focus : { ...focus, lost };

// A remembered url moves to the page that took the followed page's place.
const moved = (state: Following, page: Source): string | null =>
  state.rememberedUrl ? (page.url ?? state.rememberedUrl) : null;

const chooseIn = (state: Following): Focus =>
  choose(
    state.sources.filter((s) => s.life.state === 'alive'),
    state.rememberedUrl,
    state.waitForUrl,
  );

// The page to follow, in order of respect for what the user meant (a pick is kept by settle):
//   1. the url they were following before — a reload gives a new id, so the url is what survives
//   2. a page whose tab is shown, so the panel follows the tab the user looks at
//   3. the first page we heard from
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
  const shown = sources.find((s) => s.visible !== false);
  if (shown) return { kind: 'following', id: shown.id, why: 'first' };
  const first = sources[0];
  if (!first) return { kind: 'none' };
  return { kind: 'following', id: first.id, why: 'first', hidden: true };
}

// Following a new page asks it for its tree (it answers with its hello too) and for what happened
// before the panel connected.
function refocus(before: Following, next: Following): FollowStep {
  const was = followedIdOf(before);
  const now = followedIdOf(next);
  if (now === was) return quiet(next);
  const switched = was !== null;
  const state = { ...next, page: switched ? unknownPage() : next.page };
  // Following no page now: nothing to ask, and asking every page would wake them.
  if (!now) return { ...quiet(state), switched };
  return {
    ...quiet(state),
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
