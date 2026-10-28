import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import type { RunespectSurface } from '@runespect/agent';
import { dehydrate } from '@runespect/agent/protocol/internal';
import { isFunctionValue, pickMessage, requestMessage } from '@runespect/agent/protocol/internal';
import Counter from '../src/Counter.svelte';
import { openPanel } from './helpers/agent';

// The agent and the protocol against other frames, restarts and secret-looking urls.
let stop: (() => void) | undefined;
let app: Record<string, unknown> | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
  if (app) unmount(app);
  app = undefined;
  history.replaceState(null, '', '/');
});

function connected() {
  const sent: any[] = [];
  let listener: ((m: any) => void) | undefined;
  stop = agent.connect(
    openPanel({
      send: (m: any) => sent.push(m),
      onMessage: (cb: any) => ((listener = cb), () => {}),
    }),
  );
  return { sent, emit: (m: unknown) => listener!(m) };
}

// Any frame can postMessage the app's window; only the window itself speaks for the page.
test('the window transport hears its own window and ignores messages from other frames', () => {
  const heard: unknown[] = [];
  const off = agent.createWindowTransport(window).onMessage!((m) => heard.push(m));
  const frame = document.body.appendChild(document.createElement('iframe'));
  const message = { source: 'runespect', kind: 'request' };
  window.dispatchEvent(new MessageEvent('message', { data: message, source: frame.contentWindow }));
  window.dispatchEvent(new MessageEvent('message', { data: message, source: window }));
  off();
  frame.remove();
  expect(heard).toEqual([message]);
});

// A panel that goes away while picking gives the page its clicks back.
test('disconnecting while picking gives the page its clicks back', () => {
  const page = connected();
  page.emit(pickMessage(true));
  stop!();
  stop = undefined;

  let clicked = false;
  document.body.addEventListener('click', () => (clicked = true));
  document.body.click();
  expect(clicked).toBe(true);
});

test('while picking, pressing on the page does not reach the app either', () => {
  const page = connected();
  page.emit(pickMessage(true));
  let pressed = false;
  document.body.addEventListener('pointerdown', () => (pressed = true));
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  page.emit(pickMessage(false));
  expect(pressed).toBe(false);
});

// A hop that restarts counts from 0 again; its new events are the ones that matter.
test('events from a hop that restarted are kept, not taken for ones already seen', () => {
  connected();
  const surface = (globalThis as unknown as { __runespect: RunespectSurface }).__runespect;
  surface.absorb([{ hop: 'background', seq: 0, t: 1, ev: 'connect' }]);
  surface.absorb([{ hop: 'background', seq: 0, t: 2, ev: 'connect' }]);
  expect(surface.events.filter((e) => e.hop === 'background')).toHaveLength(2);
});

// A panel asking for the tree between a change and its flush must not cost the change its
// place in history.
test('a request between a change and its flush still records the change', () => {
  const target = document.body.appendChild(document.createElement('div'));
  app = mount(Counter, { target });
  flushSync();
  const page = connected();
  flushSync();
  const before = agent.commits().length;

  (target.querySelector('button') as HTMLButtonElement).click(); // changes count, not yet flushed
  page.emit(requestMessage());
  flushSync();
  expect(agent.commits().length).toBe(before + 1);
});

// A query string can carry an OAuth code or a token, and the hello goes to every client of
// the dev server.
test('the page url the agent announces hides the values of secret-looking parameters', () => {
  history.replaceState(null, '', '/auth/callback?code=4%2F0Ab&state=xyz&tab=2&access_token=t');
  const page = connected();
  const hello = page.sent.find((m) => m.kind === 'hello');
  expect(hello.url).toBe('/auth/callback?code=…&state=…&tab=2&access_token=…');
});

// Callbacks, methods and snippets are told apart, not all called "snippet".
test('a function is sent as a function, with its name', () => {
  function onSave(): void {}
  expect(isFunctionValue(dehydrate(onSave, 1))).toBe(true);
  expect(dehydrate(onSave, 1)).toEqual({ __runespect: 'function', name: 'onSave' });
  expect(dehydrate({ handler: () => {} }, 1)).toEqual({
    handler: { __runespect: 'function', name: 'handler' },
  });
});

// The event log, like every window channel, takes messages only from the page's own window.
test('the event log takes events only from the page itself, not from other frames', async () => {
  stop = agent.broadcast();
  const frame = document.body.appendChild(document.createElement('iframe'));
  const forged = {
    source: 'runespect',
    kind: 'events',
    events: [{ hop: 'relay', seq: 9, t: 1, ev: 'connect' }],
  };
  window.dispatchEvent(new MessageEvent('message', { data: forged, source: frame.contentWindow }));
  frame.remove();
  const surface = (globalThis as unknown as { __runespect: RunespectSurface }).__runespect;
  expect(surface.events.some((e) => e.hop === 'relay' && e.seq === 9)).toBe(false);
});
