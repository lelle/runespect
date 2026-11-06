import { test, expect } from 'vitest';
import { panelHeard, startFollowing, followedIdOf, type Numbers } from '@runespect/ui/internal';
import {
  helloMessage,
  treeMessage,
  opsMessage,
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
  let following = startFollowing(opts).state;
  let numbers: Numbers = new Map();
  let repairs: ReadonlyMap<string, number> = new Map();
  return {
    hear(msg: ToPanelMessage) {
      const step = panelHeard(following, numbers, repairs, msg, 0);
      following = step.state;
      numbers = step.numbers;
      repairs = step.repairs;
      return step;
    },
    get followed() {
      return followedIdOf(following);
    },
  };
}

test('numbers in a row: the panel follows and shows as before', () => {
  const p = panel();
  p.hear(hello('a', 1));
  const step = p.hear(tree('a', 2));

  expect(p.followed).toBe('a');
  expect(step.gap).toBeNull();
  expect(step.deliver?.kind).toBe('tree');
});

test('a gap in ops from the page it follows: not shown, its tree and whole history asked again', () => {
  const p = panel();
  p.hear(hello('a', 1));
  const step = p.hear(ops('a', 3));

  expect(step.gap).toEqual({ from: 'a', expected: 2, got: 3 });
  expect(step.repaired).toBe(true);
  expect(step.deliver).toBeNull();
  expect(step.send).toEqual([
    expect.objectContaining({ kind: 'request', to: 'a' }),
    expect.objectContaining({ kind: 'history-request', since: 0, to: 'a' }),
  ]);
});

test('gaps ask at most three times until a tree comes', () => {
  const p = panel();
  p.hear(hello('a', 1));
  const asks = [3, 5, 7, 9].map((n) => p.hear(ops('a', n)).repaired);

  expect(asks).toEqual([true, true, true, false]);
});

test('a message that stands on its own is shown even when it shows a gap', () => {
  const p = panel();
  p.hear(hello('a', 1));
  const step = p.hear(tree('a', 3));

  expect(step.deliver?.kind).toBe('tree');
  expect(step.repaired).toBe(true);
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

// The message that moves the panel to its page already asks it by name: no second ask.
test('a gap in the message that makes the panel follow its page asks that page once', () => {
  const p = panel({ rememberedUrl: '/b', waitForUrl: true });
  p.hear(tree('b', 1));
  const step = p.hear(hello('b', 3, '/b'));

  expect(p.followed).toBe('b');
  expect(step.send.filter((m) => m.kind === 'request')).toHaveLength(1);
  expect(step.repaired).toBe(false);
});
