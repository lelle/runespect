import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { startLink, linkStep, type Link, type LinkEvent } from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';
import App from '../src/App.svelte';

// A page's link to panels, as a sequence: what it hears and what each step tells the agent to do.
// The steps need no DOM; the tests at the end connect a real agent.

const page = { url: '/', title: 'Shop' };
const request = (toSelf = false): LinkEvent => ({ type: 'request', toSelf, page });

function play(...events: LinkEvent[]) {
  let step = startLink(page);
  const effects = [step.effects.map((e) => e.do)];
  for (const event of events) {
    step = linkStep(step.link, event);
    effects.push(step.effects.map((e) => e.do));
  }
  return { link: step.link, effects, last: effects.at(-1) };
}

const mode = (link: Link) => link.mode;

test('a page says hello once at connect, and is quiet', () => {
  const { link, effects } = play();

  expect(mode(link)).toBe('quiet');
  expect(effects).toEqual([['hello']]);
});

test('asked who is there, it answers and watches its url and title', () => {
  const { link, last } = play(request());

  expect(mode(link)).toBe('watched');
  expect(last).toEqual(['hello', 'watch-page']);
});

test('asked by name, it follows: tree, hello, every flush', () => {
  expect(play(request(true)).last).toEqual(['follow-flushes', 'tree', 'hello', 'watch-page']);
  expect(mode(play(request(), request(true)).link)).toBe('following');
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
  const moved: LinkEvent = { type: 'page', page: { url: '/checkout', title: 'Shop' } };

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
  );

  expect(mode(link)).toBe('ended');
  expect(effects.slice(2)).toEqual([['stop'], [], [], []]);
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
