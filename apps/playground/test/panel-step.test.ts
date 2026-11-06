import { test, expect } from 'vitest';
import {
  panelHeard,
  repairDue,
  startFollowing,
  followedIdOf,
  type PanelSide,
} from '@runespect/ui/internal';
import {
  helloMessage,
  treeMessage,
  opsMessage,
  historyMessage,
  PROTOCOL_VERSION,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';

// What the panel does with a message it hears, before the view shows it: the page's number first,
// then which page it follows. The same step for <Panel> and the simulator.

const hello = (from: string, n: number, url = '/'): ToPanelMessage => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title: url }),
  from,
  n,
});
const tree = (from: string, n: number): ToPanelMessage => ({ ...treeMessage([]), from, n });
const ops = (from: string, n: number): ToPanelMessage => ({ ...opsMessage([], n, n), from, n });

function panel(
  opts: { rememberedUrl: string | null; waitForUrl: boolean } = {
    rememberedUrl: null,
    waitForUrl: false,
  },
) {
  let side: PanelSide = {
    following: startFollowing(opts).state,
    numbers: new Map(),
    repair: null,
  };
  let clock = 0;
  return {
    hear(msg: ToPanelMessage) {
      const step = panelHeard(side, msg, clock);
      side = step.side;
      return step;
    },
    /** The clock moves on, and a repair that came due is tried again. */
    wait(ms: number) {
      clock += ms;
      const step = repairDue(side, clock);
      side = step.side;
      return step;
    },
    get followed() {
      return followedIdOf(side.following);
    },
    get side() {
      return side;
    },
  };
}

const asks = (step: { send: { kind: string; to?: string }[] }) =>
  step.send.map((m) => `${m.kind}${m.to ? ` ${m.to}` : ''}`);

test('numbers in a row: the panel follows and shows as before', () => {
  const p = panel();
  p.hear(hello('a', 1));
  const step = p.hear(tree('a', 2));

  expect(p.followed).toBe('a');
  expect(step.gap).toBeNull();
  expect(step.deliver?.kind).toBe('tree');
});

// A page asked by name answers with its tree, which the panel then waits for: these start there.
function following(id: string) {
  const p = panel();
  p.hear(hello(id, 1));
  p.hear(tree(id, 2));
  return p;
}

test('a gap in ops from the page it follows: not shown, its tree and whole history asked again', () => {
  const p = following('a');
  const step = p.hear(ops('a', 4));

  expect(step.gap).toEqual({ from: 'a', expected: 3, got: 4 });
  expect(step.repaired).toBe(true);
  expect(step.deliver).toBeNull();
  expect(step.send).toEqual([
    expect.objectContaining({ kind: 'request', to: 'a' }),
    expect.objectContaining({ kind: 'history-request', since: 0, to: 'a' }),
  ]);
});

test('a message that stands on its own is shown even when it shows a gap', () => {
  const p = following('a');
  const step = p.hear(tree('a', 4));

  expect(step.deliver?.kind).toBe('tree');
  expect(step.repaired).toBe(true);
});

test('a gap while the panel waits for the tree asks nothing more', () => {
  const p = following('a');
  p.hear(ops('a', 4));

  expect(asks(p.hear(ops('a', 6)))).toEqual([]);
});

test('a gap from another page is reported, and its message heard as usual', () => {
  const p = panel();
  p.hear(hello('a', 1));
  p.hear(hello('b', 1, '/admin'));
  const step = p.hear(hello('b', 3, '/admin/users'));

  expect(step.gap).toEqual({ from: 'b', expected: 2, got: 3 });
  expect(step.repaired).toBe(false);
  expect(step.send).toEqual([]);
  expect(p.followed).toBe('a');
});

test('a message heard before goes no further, and nothing is asked', () => {
  const p = panel();
  p.hear(hello('a', 1));
  p.hear(hello('b', 1, '/admin'));
  p.hear(hello('b', 2, '/admin'));
  p.hear(tree('a', 2));
  const fromFollowed = p.hear(tree('a', 2));
  const fromOther = p.hear(hello('b', 2, '/admin'));

  expect(fromFollowed.gap).toEqual({ from: 'a', expected: 3, got: 2 });
  expect(fromFollowed.deliver).toBeNull();
  expect(fromFollowed.send).toEqual([]);
  expect(fromOther.gap).toEqual({ from: 'b', expected: 3, got: 2 });
  expect(fromOther.repaired).toBe(false);
  expect(fromOther.send).toEqual([]);
});

// What the panel sends to repair a gap can be lost too: without a tree in time, it asks again.
test('a repair with no tree in time is asked again, up to three times, and then not on a gap', () => {
  const p = following('a');
  const gap = p.hear(ops('a', 4));
  expect(gap.repairAt).toBe(1000);

  const second = p.wait(1000);
  const third = p.wait(1000);
  const given = p.wait(1000);

  expect(asks(second)).toEqual(['request a', 'history-request a']);
  expect(asks(third)).toEqual(['request a', 'history-request a']);
  expect(asks(given)).toEqual([]);
  expect(asks(p.hear(ops('a', 6)))).toEqual([]);
});

test('its tree and history end the repair, and a timer after it does nothing', () => {
  const p = following('a');
  p.hear(ops('a', 4));
  p.hear(tree('a', 5));
  p.hear({ ...historyMessage([], false), from: 'a', n: 6 });

  expect(p.side.repair).toBeNull();
  expect(asks(p.wait(1000))).toEqual([]);
});

test('a timer that comes early does nothing', () => {
  const p = following('a');
  p.hear(ops('a', 4));

  expect(asks(p.wait(500))).toEqual([]);
  expect(p.side.repair).not.toBeNull();
});

// The message that moves the panel to its page already asks it by name: no second ask.
test('a gap in the message that makes the panel follow its page asks that page once', () => {
  const p = panel({ rememberedUrl: '/b', waitForUrl: true });
  p.hear(tree('b', 1));
  const step = p.hear(hello('b', 3, '/b'));

  expect(p.followed).toBe('b');
  expect(step.send.filter((m) => m.kind === 'request')).toHaveLength(1);
  expect(step.repaired).toBe(false);
});

// A history the transport always refuses: each tree that does come must not start the asks over.
test('a repair is over once both the tree and the history came', () => {
  const p = following('a');
  p.hear(ops('a', 4));
  p.hear(tree('a', 5));
  expect(p.side.repair).not.toBeNull();

  p.hear({ ...historyMessage([], false), from: 'a', n: 6 });
  expect(p.side.repair).toBeNull();
});
