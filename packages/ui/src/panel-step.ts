import {
  historyRequestMessage,
  requestMessage,
  type ToPanelMessage,
  type ToPageMessage,
} from '@runespect/agent/protocol/internal';
import {
  follow,
  followedIdOf,
  quiet,
  type FollowEvent,
  type Following,
  type FollowStep,
} from './follow';
import { hearNumber, REPAIR_ATTEMPTS, type Gap, type Numbers } from './numbering';
import { WAIT_MS } from './sources';

// What the panel does with a message it hears, before the view shows it: the page's number first,
// then which page it follows. <Panel> and the simulator in the playground's tests take this step.

/**
 * A tree and history asked for by name, after a gap or on following a page: due by `until`. What
 * the panel sends can be lost too, and a page that never got the request sends nothing and leaves
 * no gap. Over once both came: a history the transport always refuses uses up its number each
 * time, so a tree alone ending it would start the asks over on the next gap.
 */
export interface Repair {
  readonly id: string;
  readonly attempts: number;
  readonly until: number;
  readonly tree: boolean;
  readonly history: boolean;
}

export interface PanelSide {
  readonly following: Following;
  readonly numbers: Numbers;
  readonly repair: Repair | null;
}

export interface HeardStep extends FollowStep {
  side: PanelSide;
  gap: Gap | null;
  /** The gap was in the page it follows: its tree and history were asked for again. */
  repaired: boolean;
  /** When to come back with repairDue, if a repair waits for its tree. */
  repairAt: number | null;
}

// Following a page waits for its tree; a repair after a gap for its history too.
const asking = (id: string, attempts: number, now: number, history = false): Repair => ({
  id,
  attempts,
  until: now + WAIT_MS,
  tree: false,
  history,
});

const still = (side: PanelSide): HeardStep => ({
  ...quiet(side.following),
  side,
  gap: null,
  repaired: false,
  repairAt: null,
});

// A gap from the page it follows means the tree it holds may be wrong, whatever was lost: the page
// is asked for its tree and its whole history again, and then by its deadline until both come,
// REPAIR_ATTEMPTS times at most. A gap while it waits asks nothing more. Only ops build on what
// came before, so they are not applied; a tree, a picked or a hydrate stands on its own. A message
// older than what the panel has is dropped, with nothing to ask.
export function panelHeard(side: PanelSide, msg: ToPanelMessage, now: number): HeardStep {
  const heard = hearNumber(side.numbers, msg);
  const next = { ...side, numbers: heard.numbers };
  if (heard.stale) return { ...still(next), gap: heard.gap };
  const step =
    msg.kind === 'ops' && heard.gap ? still(next) : panelStep(next, { type: 'heard', msg }, now);
  const followed = followedIdOf(step.side.following);
  // The page it follows after this message: one it moved away from is not asked.
  if (!heard.gap || heard.gap.from !== followed || step.side.repair?.id === followed) {
    return { ...step, gap: heard.gap };
  }
  const repair = asking(followed, 1, now);
  return {
    ...step,
    send: [...step.send, ...ask(step.side.following, now)],
    side: { ...step.side, repair },
    gap: heard.gap,
    repaired: true,
    repairAt: repair.until,
  };
}

/** Any other step of the panel (a pick, a command, a page's wait ending), as panelHeard does. */
export function panelStep(side: PanelSide, event: FollowEvent, now: number): HeardStep {
  const step = follow(side.following, event, now);
  const followed = followedIdOf(step.state);
  const following = { ...side, following: step.state };
  if (followed && step.send.some((m) => m.kind === 'request' && m.to === followed)) {
    const repair = asking(followed, 1, now, true);
    return { ...still(following), ...step, side: { ...following, repair }, repairAt: repair.until };
  }
  return {
    ...still(following),
    ...step,
    side: { ...following, repair: came(side.repair, event, followed) },
  };
}

// What came for the repair, or another page followed now: the wait for it is over.
function came(repair: Repair | null, event: FollowEvent, followed: string | null): Repair | null {
  if (!repair || repair.id !== followed) return null;
  if (event.type !== 'heard' || event.msg.from !== repair.id) return repair;
  const kind = event.msg.kind;
  const next = {
    ...repair,
    tree: repair.tree || kind === 'tree',
    history: repair.history || kind === 'history',
  };
  return next.tree && next.history ? null : next;
}

/** A repair's time came and it is not over: the page is asked again, until it has been asked enough. */
export function repairDue(side: PanelSide, now: number): HeardStep {
  const repair = side.repair;
  if (!repair || repair.until > now) return still(side);
  if (repair.id !== followedIdOf(side.following)) return still({ ...side, repair: null });
  // Asked enough: it waits, with no deadline, for what it asked or another page to follow, so a gap
  // after this does not start it over.
  if (repair.attempts >= REPAIR_ATTEMPTS) {
    return still({ ...side, repair: { ...repair, until: Infinity } });
  }
  const next = asking(repair.id, repair.attempts + 1, now);
  return {
    ...still({ ...side, repair: next }),
    send: ask(side.following, now),
    repaired: true,
    repairAt: next.until,
  };
}

function ask(following: Following, now: number): ToPageMessage[] {
  const addressed = (msg: ToPageMessage) => follow(following, { type: 'command', msg }, now).send;
  return [...addressed(requestMessage()), ...addressed(historyRequestMessage(0))];
}
