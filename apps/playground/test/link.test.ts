import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { startLink, linkStep, type Link, type LinkEvent } from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';
import App from '../src/App.svelte';

// A page's link to panels, as a sequence: what it hears and what each step tells the agent to do.
// The steps need no DOM; the tests at the end connect a real agent.

const page = { url: '/', title: 'Shop', visible: true };
const request = (toSelf = false): LinkEvent => ({ type: 'request', toSelf, page });
const ping: LinkEvent = { type: 'ping', page };

function play(...events: LinkEvent[]) {
  return playFrom(null, ...events);
}

// `previous`: the id the tab's sessionStorage held at load, from the page load before.
function playFrom(previous: string | null, ...events: LinkEvent[]) {
  let step = startLink(page, previous);
  const effects = [step.effects.map((e) => e.do)];
  for (const event of events) {
    step = linkStep(step.link, event);
    effects.push(step.effects.map((e) => e.do));
  }
  return { link: step.link, effects, last: effects.at(-1) };
}

const mode = (link: Link) => link.mode;

test('a page no panel watched before says hello once at connect, and is quiet', () => {
  const { link, effects } = play();

  expect(mode(link)).toBe('quiet');
  expect(effects).toEqual([['hello']]);
});

test('a page whose tab a panel watched before says which page it replaces, and is watched', () => {
  const start = startLink(page, 'i7');

  expect(mode(start.link)).toBe('watched');
  expect(start.effects).toEqual([
    { do: 'hello', page, replaces: 'i7' },
    { do: 'watch-page' },
    { do: 'remember' },
  ]);
});

test('asked who is there, it answers, watches its url and title, and remembers it', () => {
  const { link, last } = play(request());

  expect(mode(link)).toBe('watched');
  expect(last).toEqual(['hello', 'watch-page', 'remember']);
});

test('asked by name, it follows: tree, hello, every flush', () => {
  expect(play(request(true)).last).toEqual([
    'follow-flushes',
    'tree',
    'hello',
    'watch-page',
    'remember',
  ]);
  expect(play(request(), request(true)).last).toEqual([
    'follow-flushes',
    'tree',
    'hello',
    'watch-page',
  ]);
  expect(mode(play(request(), request(true)).link)).toBe('following');
});

test('pinged, a quiet page answers and is watched, but does not follow', () => {
  const { link, last } = play(ping);

  expect(mode(link)).toBe('watched');
  expect(last).toEqual(['hello', 'watch-page', 'remember']);
  expect(play(request(), ping).last).toEqual(['hello']);
  expect(mode(play(request(true), ping).link)).toBe('following');
});

test('a watched page says bye when it is hidden for good, a quiet one says nothing', () => {
  expect(play(request(), { type: 'pagehide' }).last).toEqual(['bye']);
  expect(play(request(true), { type: 'pagehide' }).last).toEqual(['bye']);
  expect(playFrom('i7', { type: 'pagehide' }).last).toEqual(['bye']);
  expect(play({ type: 'pagehide' }).last).toEqual([]);
  expect(mode(play(request(), { type: 'pagehide' }).link)).toBe('away');
});

// Chrome tells a page it is hidden after pagehide: a page that said bye must not say hello again.
test('after bye a page says nothing more, until it comes back', () => {
  const hidden: LinkEvent = { type: 'page', page: { ...page, visible: false } };
  const { link, effects } = play(
    request(true),
    { type: 'pagehide' },
    hidden,
    { type: 'flush', changed: true },
    request(true),
    ping,
    { type: 'pagehide' },
  );

  expect(mode(link)).toBe('away');
  expect(effects.slice(2)).toEqual([['bye'], [], [], [], [], []]);
  expect(mode(play(request(true), { type: 'pagehide' }, { type: 'pageshow', page }).link)).toBe(
    'following',
  );
});

test('back from the back/forward cache, a watched page says hello with no replaces', () => {
  const { link, last } = playFrom('i7', { type: 'pagehide' }, { type: 'pageshow', page });

  expect(last).toEqual(['hello', 'remember']);
  expect(mode(link)).toBe('watched');
  expect(play({ type: 'pagehide' }, { type: 'pageshow', page }).last).toEqual([]);
});

test('a watched page says hello when it is shown or hidden', () => {
  const hidden: LinkEvent = { type: 'page', page: { ...page, visible: false } };

  expect(play(request(), hidden).last).toEqual(['hello']);
  expect(play(request(), hidden, { type: 'page', page }).last).toEqual(['hello']);
  expect(play(hidden).last).toEqual([]);
});

test('asked again while watched, it only answers', () => {
  const { link, last } = play(request(), request());

  expect(mode(link)).toBe('watched');
  expect(last).toEqual(['hello', 'watch-page']);
});

test('asked by anyone while following, a reconnecting panel gets its tree again', () => {
  const { link, last } = play(request(true), request());

  expect(mode(link)).toBe('following');
  expect(last).toEqual(['follow-flushes', 'tree', 'hello', 'watch-page']);
});

test('a new url or title says hello with it once watched, never while quiet', () => {
  const moved: LinkEvent = { type: 'page', page: { ...page, url: '/checkout' } };

  expect(play(moved).last).toEqual([]);
  expect(play(request(), moved).last).toEqual(['hello']);
  expect(play(request(true), moved).last).toEqual(['hello']);
  expect(play(request(), moved, moved).last).toEqual([]);
  expect(play(request(), { type: 'page', page }).last).toEqual([]);
});

test('a flush that changed something sends ops, only while following', () => {
  const changed: LinkEvent = { type: 'flush', changed: true };

  expect(play(changed).last).toEqual([]);
  expect(play(request(), changed).last).toEqual([]);
  expect(play(request(true), changed).last).toEqual(['ops']);
  expect(play(request(true), { type: 'flush', changed: false }).last).toEqual([]);
});

test('a disconnect stops everything, and nothing after it does anything', () => {
  const { link, effects } = play(
    request(true),
    { type: 'disconnect' },
    request(true),
    { type: 'flush', changed: true },
    { type: 'page', page: { url: '/x' } },
    { type: 'pagehide' },
    ping,
  );

  expect(mode(link)).toBe('ended');
  expect(effects.slice(2)).toEqual([['stop'], [], [], [], [], []]);
});

// ── a real agent ──

let disconnect: (() => void) | undefined;
let app: Record<string, unknown> | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  if (app) unmount(app);
  app = undefined;
});

// The first tree is sent when the panel asks, and the first flush after it sends only what changed.
test('a page asked by name sends one tree, then only ops as the app changes', () => {
  app = mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  const sent: Message[] = [];
  let deliver: (m: Message) => void = () => {};
  disconnect = agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      deliver = cb;
      return () => {};
    },
  });
  const pageId = sent.find((m) => m.kind === 'hello')!.from;

  deliver({ ...requestMessage(), to: pageId });
  flushSync();
  (document.querySelector('button') as HTMLButtonElement).click();
  flushSync();

  const kinds = sent.map((m) => m.kind).filter((k) => k === 'tree' || k === 'ops');
  expect(kinds).toEqual(['tree', 'ops']);
});

// A transport may hand over what it already holds as soon as it is listened to.
test('a transport that delivers a request as it is subscribed to is answered', () => {
  const sent: Message[] = [];
  disconnect = agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      cb(requestMessage());
      return () => {};
    },
  });

  expect(sent.map((m) => m.kind)).toEqual(['hello', 'hello']);
});
