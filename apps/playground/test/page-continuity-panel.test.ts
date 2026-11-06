import { test, expect } from 'vitest';
import {
  startFollowing,
  follow,
  followedIdOf,
  listedSources,
  type FollowStep,
} from '@runespect/ui/internal';
import {
  helloMessage,
  PROTOCOL_VERSION,
  type HelloMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';

// The panel keeps to its tab across a reload and drops tabs that are gone: a page says bye when it
// goes, and the next page in the tab says which page it replaces. Rows are Peer (sources.ts), the
// page followed is Focus (follow.ts).

const WAIT = 1000;

const hello = (id: string, url: string, extra: Partial<HelloMessage> = {}): ToPanelMessage => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title: url, visible: true }),
  ...extra,
  from: id,
});
const bye = (id: string): ToPanelMessage => ({ source: 'runespect', kind: 'bye', from: id });

function panel(opts: { rememberedUrl?: string; waitForUrl?: boolean; oneTab?: boolean } = {}) {
  let step: FollowStep = startFollowing({
    rememberedUrl: opts.rememberedUrl ?? null,
    waitForUrl: opts.waitForUrl ?? false,
    oneTab: opts.oneTab,
  });
  let clock = 0;
  const timers: { at: number; id: string }[] = [];
  const apply = (event: Parameters<typeof follow>[1]): FollowStep => {
    step = follow(step.state, event, clock);
    timers.push(...step.timers);
    return step;
  };
  return {
    hear: (msg: ToPanelMessage) => apply({ type: 'heard', msg }),
    pick: (id: string) => apply({ type: 'pick', id }),
    /** Moves the clock on, firing every timer that comes due. */
    wait(ms: number): FollowStep[] {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers.splice(0, timers.length, ...timers.filter((t) => t.at > clock));
      return due.map((t) => apply({ type: 'timeout', id: t.id }));
    },
    get followed() {
      return followedIdOf(step.state);
    },
    get why() {
      return step.state.focus.kind === 'following' ? step.state.focus.why : null;
    },
    get rows() {
      return listedSources(step.state).map((s) => s.id);
    },
    get state() {
      return step.state;
    },
  };
}

const asked = (step: FollowStep) =>
  step.send.filter((m) => m.kind === 'request' && m.to).map((m) => m.to);
const pinged = (step: FollowStep) => step.send.filter((m) => m.kind === 'ping').map((m) => m.to);

test("a page's first hello is answered with a ping, a known page's is not", () => {
  const p = panel();
  const first = p.hear(hello('a', '/'));
  const second = p.hear(hello('b', '/admin'));
  const again = p.hear(hello('b', '/admin', { title: 'Admin' }));

  expect(pinged(first)).toEqual([]); // asked by name instead
  expect(asked(first)).toEqual(['a']);
  expect(pinged(second)).toEqual(['b']);
  expect(pinged(again)).toEqual([]);
});

test('a reload says bye, then the new page replaces it: the panel follows it, one row', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(bye('a'));
  expect(p.followed).toBe('a');

  const step = p.hear(hello('a2', '/', { replaces: 'a' }));

  expect(p.followed).toBe('a2');
  expect(step.switched).toBe(true);
  expect(asked(step)).toEqual(['a2']);
  expect(p.rows).toEqual(['a2']);
});

test('a reload with another page at the url: the other page is never asked', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  const other = p.hear(hello('c', '/'));
  const left = p.hear(bye('a'));
  const back = p.hear(hello('a2', '/', { replaces: 'a' }));

  expect([...asked(other), ...asked(left), ...asked(back)]).toEqual(['a2']);
  expect(p.followed).toBe('a2');
});

test('bye and no new page in the wait: gone, chosen again; a late reload takes the panel back', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('c', '/admin'));
  p.hear(bye('a'));
  p.wait(WAIT);

  expect(p.followed).toBe('c');
  expect(p.rows).toEqual(['c']);

  p.hear(hello('a2', '/', { replaces: 'a' }));
  expect(p.followed).toBe('a2');
});

test('a late reload does not take the panel back from a page the user picked in between', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('c', '/admin'));
  p.hear(bye('a'));
  p.wait(WAIT);
  p.pick('c');
  p.hear(hello('a2', '/', { replaces: 'a' }));

  expect(p.followed).toBe('c');
});

test('a picked page stays picked under its new id; a remembered url moves with it', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('b', '/admin'));
  p.pick('b');
  p.hear(bye('b'));
  p.hear(hello('b2', '/admin/users', { replaces: 'b' }));

  expect(p.followed).toBe('b2');
  expect(p.why).toBe('picked');
  expect(p.state.rememberedUrl).toBe('/admin/users');
});

test('a reload whose bye was lost: the old page is pinged, and gone when it does not answer', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  const replaced = p.hear(hello('a2', '/', { replaces: 'a' }));
  expect(pinged(replaced)).toEqual(['a2', 'a']);
  expect(p.followed).toBe('a');

  p.wait(WAIT);

  expect(p.followed).toBe('a2');
  expect(p.rows).toEqual(['a2']);
});

test('a copied tab: the old page answers the ping and keeps the panel, both listed', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('a2', '/', { replaces: 'a' }));
  p.hear(hello('a', '/'));
  p.wait(WAIT);

  expect(p.followed).toBe('a');
  expect(p.rows).toEqual(['a', 'a2']);
});

test('a bye from the old page in the wait ends it at once', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('a2', '/', { replaces: 'a' }));
  p.hear(bye('a'));

  expect(p.followed).toBe('a2');
});

test('a second page that replaces the same page is a page of its own, and does not move the panel', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(bye('a'));
  p.hear(hello('a2', '/', { replaces: 'a' }));
  p.hear(hello('a3', '/', { replaces: 'a' }));

  expect(p.followed).toBe('a2');
  expect(p.rows).toEqual(['a2', 'a3']);
});

test('a bye from a page not followed takes its row away, and twice reloaded it is one row', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('b', '/admin'));
  p.hear(bye('b'));
  expect(p.rows).toEqual(['a']);

  p.hear(hello('b2', '/admin', { replaces: 'b' }));
  p.hear(bye('b2'));
  p.hear(hello('b3', '/admin', { replaces: 'b2' }));

  expect(p.rows).toEqual(['a', 'b3']);
});

test('a new page, or a known page retitling, does not move the panel (#36 Known gap)', () => {
  const p = panel();
  p.hear(hello('b', '/cart'));
  p.hear(hello('a', '/cart'));
  p.hear(hello('a', '/cart', { title: 'Cart (2)' }));
  p.hear(hello('c', '/admin'));

  expect(p.followed).toBe('b');
});

test('a reload that cannot name the page before: once the wait ends, the new page at the url', () => {
  const p = panel({ rememberedUrl: '/cart' });
  p.hear(hello('a', '/cart'));
  p.hear(bye('a'));
  p.hear(hello('a2', '/cart'));
  expect(p.followed).toBe('a');

  p.wait(WAIT);

  expect(p.followed).toBe('a2');
});

test('opened after a hidden and a visible page loaded, it follows the visible one', () => {
  const p = panel();
  p.hear(hello('hidden', '/a', { visible: false }));
  p.hear(hello('shown', '/b', { visible: true }));

  expect(p.followed).toBe('shown');
});

test('a page opened for a url wins over a visible one', () => {
  const p = panel({ rememberedUrl: '/a', waitForUrl: true });
  p.hear(hello('shown', '/b', { visible: true }));
  p.hear(hello('hidden', '/a', { visible: false }));

  expect(p.followed).toBe('hidden');
});

test('a page shown or hidden does not move the panel; once it is gone, the visible page now', () => {
  const p = panel();
  p.hear(hello('a', '/a'));
  p.hear(hello('b', '/b', { visible: false }));
  p.hear(hello('c', '/c', { visible: false }));
  p.hear(hello('a', '/a', { visible: false }));
  p.hear(hello('c', '/c', { visible: true }));
  expect(p.followed).toBe('a');

  p.hear(bye('a'));
  p.wait(WAIT);

  expect(p.followed).toBe('c');
});

test('a page being reloaded stays listed while it is followed, and no longer', () => {
  const p = panel();
  p.hear(hello('a', '/'));
  p.hear(hello('b', '/admin'));
  p.hear(bye('a'));

  expect(p.rows).toEqual(['a', 'b']);
  p.hear(bye('b'));
  expect(p.rows).toEqual(['a']);
});

// The user opens another tab in the same window: the page the panel follows goes hidden and the new
// one is shown. Only a page that was hidden when the panel chose it gives way to a shown one.
test('a tab opened in front of the followed page does not take the panel', () => {
  const p = panel();
  p.hear(hello('a', '/a'));
  p.hear(hello('a', '/a', { visible: false }));
  p.hear(hello('b', '/b', { visible: true }));

  expect(p.followed).toBe('a');
});

test('a lost page back from the back/forward cache, under its own id, takes the panel back', () => {
  const p = panel();
  p.hear(hello('a', '/a'));
  p.hear(hello('c', '/c'));
  p.hear(bye('a'));
  p.wait(WAIT);
  expect(p.followed).toBe('c');

  p.hear(hello('a', '/a'));

  expect(p.followed).toBe('a');
});

test('a picked page gone with no other page: nothing is asked, and its reload is picked again', () => {
  const p = panel();
  p.hear(hello('a', '/a'));
  p.pick('a');
  p.hear(bye('a'));
  const gone = p.wait(WAIT);
  expect(p.followed).toBeNull();
  expect(gone.flatMap((s) => s.send)).toEqual([]);

  p.hear(hello('a2', '/a', { replaces: 'a' }));

  expect(p.followed).toBe('a2');
  expect(p.why).toBe('picked');
});

// The extension's panel hears one tab, routed by the background: a page in it that replaces the
// page followed is its reload, even when the bye was lost (a page that is unloading cannot always
// post it to the content script).
test('a panel for one tab follows the page that replaces its page at once, with no ping', () => {
  const p = panel({ oneTab: true });
  p.hear(hello('a', '/'));
  const step = p.hear(hello('a2', '/', { replaces: 'a' }));

  expect(p.followed).toBe('a2');
  expect(asked(step)).toEqual(['a2']);
  expect(pinged(step)).toEqual([]);
  expect(p.rows).toEqual(['a2']);
});
