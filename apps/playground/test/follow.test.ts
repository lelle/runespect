import { test, expect } from 'vitest';
import { startFollowing, follow, type FollowStep } from '@runespect/ui/internal';
import {
  helloMessage,
  treeMessage,
  opsMessage,
  editMessage,
  PROTOCOL_VERSION,
  type HelloMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';

// Which page the panel follows, as a sequence: what the panel hears, what the user picks, and what
// each step tells the view to show, send and drop. No DOM and no Svelte.

const hello = (id: string, url: string, extra: Partial<HelloMessage> = {}): ToPanelMessage => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title: url }),
  ...extra,
  from: id,
});
const tree = (from?: string): ToPanelMessage => ({
  ...treeMessage([]),
  ...(from ? { from } : {}),
});

function panel(opts: { rememberedUrl?: string; waitForUrl?: boolean } = {}) {
  let step = startFollowing({
    rememberedUrl: opts.rememberedUrl ?? null,
    waitForUrl: opts.waitForUrl ?? false,
  });
  let clock = 0;
  const apply = (event: Parameters<typeof follow>[1]): FollowStep =>
    (step = follow(step.state, event, ++clock));
  return {
    get state() {
      return step.state;
    },
    hear: (msg: ToPanelMessage) => apply({ type: 'heard', msg }),
    pick: (id: string) => apply({ type: 'pick', id }),
    command: () => apply({ type: 'command', msg: editMessage(1, 'count', 2) }),
  };
}

const sent = (step: FollowStep) => step.send.map((m) => [m.kind, m.to]);

test('a new panel asks every page who is there, by name none of them', () => {
  const step = startFollowing({ rememberedUrl: null, waitForUrl: false });
  expect(sent(step)).toEqual([
    ['request', undefined],
    ['history-request', undefined],
  ]);
});

test('the first page heard is followed and asked for its tree and history', () => {
  const p = panel();
  const step = p.hear(hello('a', '/cart'));

  expect(p.state.followedId).toBe('a');
  expect(sent(step)).toEqual([
    ['request', 'a'],
    ['history-request', 'a'],
  ]);
  expect(step.switched).toBe(false); // nothing was shown yet, so nothing to drop
});

test('every page heard is listed once, refreshed when it speaks again', () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin'));
  const step = p.hear(hello('a', '/cart'));

  expect(p.state.sources.map((s) => [s.id, s.lastSeen])).toEqual([
    ['a', 3],
    ['b', 2],
  ]);
  expect(p.state.followedId).toBe('a');
  expect(step.send).toEqual([]); // the followed page is not asked again
});

// A reload gives the page a new id, so the url is what the panel remembers.
test('the remembered url wins over the first page heard', () => {
  const p = panel({ rememberedUrl: '/cart' });
  p.hear(hello('stale-tab', '/admin'));
  p.hear(hello('fresh-after-reload', '/cart'));

  expect(p.state.followedId).toBe('fresh-after-reload');
});

test('a url remembered from last time falls back to the first page heard', () => {
  const p = panel({ rememberedUrl: '/admin' });
  p.hear(hello('a', '/cart'));

  expect(p.state.followedId).toBe('a');
});

// A reloaded page announces itself under a new id at the same url, and the dead one stays listed: a
// quiet page and a closed one look the same.
test('a reload of the followed page moves the panel to the reloaded page', () => {
  const p = panel();
  p.hear(hello('before-reload', '/cart'));
  p.hear(hello('other-tab', '/admin'));
  const step = p.hear(hello('after-reload', '/cart'));

  expect(p.state.followedId).toBe('after-reload');
  expect(step.switched).toBe(true);
  expect(sent(step)).toEqual([
    ['request', 'after-reload'],
    ['history-request', 'after-reload'],
  ]);
});

test('a reload of the remembered page moves the panel to the reloaded page', () => {
  const p = panel({ rememberedUrl: '/cart' });
  p.hear(hello('before-reload', '/cart'));
  p.hear(hello('after-reload', '/cart'));

  expect(p.state.followedId).toBe('after-reload');
});

test('a pick moves the panel to that page, remembers its url, and asks it alone', () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin'));
  const step = p.pick('b');

  expect(p.state.followedId).toBe('b');
  expect(p.state.rememberedUrl).toBe('/admin');
  expect(step.switched).toBe(true);
  expect(sent(step)).toEqual([
    ['request', 'b'],
    ['history-request', 'b'],
  ]);
});

test('a picked page stays followed while the others speak or reload', () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin'));
  p.pick('b');
  p.hear(hello('a', '/cart'));
  p.hear(hello('a2', '/cart'));

  expect(p.state.followedId).toBe('b');
});

test('picking the page already followed changes nothing', () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin'));
  const step = p.pick('a');

  expect(step.switched).toBe(false);
  expect(step.send).toEqual([]);
  expect(p.state.rememberedUrl).toBeNull();
});

// A page reads nothing until a panel asks it by name, so following another page while the one the
// panel was opened for has not answered would wake a page nobody is looking at.
test('a panel opened for a page asks no other page, and shows nothing, while it waits', () => {
  const p = panel({ rememberedUrl: '/admin', waitForUrl: true });
  const steps = [
    p.hear(hello('a', '/cart')),
    p.hear(tree('a')),
    p.hear(tree()), // from-less, as the extension's names-only walk sends it
  ];

  expect(p.state.followedId).toBeNull();
  expect(steps.flatMap((s) => s.send)).toEqual([]);
  expect(steps.map((s) => s.deliver)).toEqual([null, null, null]);
});

test('a panel opened for a page follows it once it arrives, and asks it alone', () => {
  const p = panel({ rememberedUrl: '/admin', waitForUrl: true });
  p.hear(hello('a', '/cart'));
  const step = p.hear(hello('b', '/admin'));

  expect(p.state.followedId).toBe('b');
  expect(sent(step)).toEqual([
    ['request', 'b'],
    ['history-request', 'b'],
  ]);
});

// The filter keeps a forgotten second tab from answering the panel's questions.
test("another page's tree and history are not shown", () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin'));

  expect(p.hear(tree('b')).deliver).toBeNull();
  expect(p.hear({ ...opsMessage([], 1, 0), from: 'b' }).deliver).toBeNull();
  expect(p.hear(tree('a')).deliver).toEqual(tree('a'));
});

test("another page's hello does not change what the panel says about the followed one", () => {
  const p = panel();
  p.hear(hello('a', '/cart'));
  p.hear(hello('b', '/admin', { version: PROTOCOL_VERSION + 1, tier: 2, problem: 'no hooks' }));

  expect(p.state.page).toEqual({
    version: PROTOCOL_VERSION,
    tier: 0,
    problem: null,
    openInEditor: true,
  });
});

test('the followed page says its version, tier, problem and whether editor links work', () => {
  const p = panel();
  p.hear(hello('a', '/cart', { version: 1, problem: 'no hooks', openInEditor: false }));
  expect(p.state.page).toEqual({ version: 1, tier: 0, problem: 'no hooks', openInEditor: false });

  p.hear(hello('a', '/cart', { tier: undefined })); // a hello without a tier keeps the last one
  expect(p.state.page).toEqual({
    version: PROTOCOL_VERSION,
    tier: 0,
    problem: null,
    openInEditor: true,
  });
});

test('following another page forgets what the last one said', () => {
  const p = panel();
  p.hear(hello('a', '/cart', { tier: 2, problem: 'no hooks' }));
  p.hear(hello('b', '/admin', { tier: undefined }));
  p.pick('b');

  expect(p.state.page).toEqual({ version: null, tier: null, problem: null, openInEditor: true });
});

// The extension's names-only walk sends trees without `from`; the background already routes it by tab.
test('a message with no sender is shown while the panel follows a page', () => {
  const p = panel();
  p.hear(hello('a', '/cart'));

  expect(p.hear(tree()).deliver).toEqual(tree());
});

// After a reconnect the page sends its tree before its hello, so a panel that follows nothing yet
// must not wait for one.
test('a panel that follows nothing and waits for nothing shows what it hears', () => {
  const p = panel();

  expect(p.hear(tree('a')).deliver).toEqual(tree('a'));
});

test('a command goes to the followed page by name', () => {
  const p = panel();
  expect(sent(p.command())).toEqual([['edit', undefined]]);

  p.hear(hello('a', '/cart'));
  expect(sent(p.command())).toEqual([['edit', 'a']]);
});

test('a page that says hello without a url is followed by its id', () => {
  const p = panel();
  p.hear({ ...helloMessage(PROTOCOL_VERSION, 0), from: 'no-url' });

  expect(p.state.followedId).toBe('no-url');
});

// Two pages at one url: the one heard from last is the one followed.
test('of two pages at one url, the panel follows the one that spoke last', () => {
  const p = panel();
  p.hear(hello('first', '/cart'));
  p.hear(hello('second', '/cart'));
  expect(p.state.followedId).toBe('second');

  p.hear(hello('first', '/cart'));
  expect(p.state.followedId).toBe('first');
});
