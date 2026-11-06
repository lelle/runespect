import {
  historyRequestMessage,
  requestMessage,
  type ToPanelMessage,
  type ToPageMessage,
} from '@runespect/agent/protocol/internal';
import { follow, followedIdOf, type Following, type FollowStep } from './follow';
import { hearNumber, REPAIR_ATTEMPTS, type Gap, type Numbers } from './numbering';

// What the panel does with a message it hears, before the view shows it: the page's number first,
// then which page it follows. <Panel> and the simulator in the playground's tests take this step.

export interface HeardStep extends FollowStep {
  numbers: Numbers;
  /** How often each page was asked for its tree after a gap, since its last tree. */
  repairs: ReadonlyMap<string, number>;
  gap: Gap | null;
  /** The gap was in the page it follows: its tree and history were asked for again. */
  repaired: boolean;
}

// A gap from the page it follows means the tree it holds may be wrong, whatever was lost: the page
// is asked for its tree and its whole history again, up to REPAIR_ATTEMPTS times until a tree
// comes (a tree the transport always refuses uses up its number each time, so asking on every gap
// would never end). Only ops build on what came before, so they are not applied; a tree, a picked
// or a hydrate stands on its own. A message older than what the panel has is dropped, with nothing
// to ask.
export function panelHeard(
  following: Following,
  numbers: Numbers,
  repairs: ReadonlyMap<string, number>,
  msg: ToPanelMessage,
  now: number,
): HeardStep {
  const heard = hearNumber(numbers, msg);
  // Its tree came: the asks for it start over.
  const treeFrom = msg.kind === 'tree' ? msg.from : undefined;
  const settled = treeFrom && repairs.has(treeFrom) ? without(repairs, treeFrom) : repairs;
  const nothing = { state: following, deliver: null, send: [], switched: false };
  const base = { numbers: heard.numbers, repairs: settled, gap: heard.gap, repaired: false };
  if (heard.stale) return { ...nothing, ...base };
  const step = follow(following, { type: 'heard', msg }, now);
  const shown = msg.kind === 'ops' ? nothing : step;
  // The page it follows after this message: one it moved away from is not asked, and one this
  // message made it follow is asked by name already.
  const followed = followedIdOf(shown.state);
  const askedNow = shown.send.some((m) => m.kind === 'request' && m.to === followed);
  if (!heard.gap || heard.gap.from !== followed || askedNow) return { ...step, ...base };
  const times = settled.get(followed) ?? 0;
  if (times >= REPAIR_ATTEMPTS) return { ...shown, ...base };
  return {
    ...shown,
    send: [...shown.send, ...askAgain(shown.state, now)],
    ...base,
    repairs: new Map(settled).set(followed, times + 1),
    repaired: true,
  };
}

function without(map: ReadonlyMap<string, number>, key: string): ReadonlyMap<string, number> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

function askAgain(following: Following, now: number): ToPageMessage[] {
  const addressed = (msg: ToPageMessage) => follow(following, { type: 'command', msg }, now).send;
  return [...addressed(requestMessage()), ...addressed(historyRequestMessage(0))];
}
