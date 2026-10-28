import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { requestMessage, type Message } from '@runespect/agent/protocol/internal';
import type { RunespectSurface } from '@runespect/agent/internal';
import App from '../src/App.svelte';
import UnreadDerived from '../src/UnreadDerived.svelte';
import CountedStore from '../src/CountedStore.svelte';
import { subscribers } from '../src/modules/counted-store';

// 34 test files start with reset() and trust it to leave an agent as a fresh page would have it.
// This touches every part of the agent and compares what can be observed afterwards with that.

beforeEach(() => agent.reset());

const surface = () => (globalThis as unknown as { __runespect: RunespectSurface }).__runespect;

function observe() {
  const box = document.querySelector<HTMLElement>('[data-runespect-highlight]');
  return {
    nodes: agent.allNodes(),
    commits: agent.commits(),
    events: surface().events,
    tree: surface().tree(),
    highlighted: box?.style.display === 'block',
  };
}
const fresh = { nodes: [], commits: [], events: [], tree: [], highlighted: false };

function useEveryPart() {
  const sent: Message[] = [];
  let listener: ((m: Message) => void) | undefined;
  agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      listener = cb;
      return () => (listener = undefined);
    },
  });
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  const page = sent.find((m) => m.kind === 'hello')!.from!;
  listener!({ ...requestMessage(), to: page });
  flushSync();
  const counter = agent.allNodes().find((n) => n.name === 'Counter')!;
  surface().set(counter.id, 'count', 5);
  flushSync();
  agent.highlight(counter.id);
  agent.startPick(() => {});
  surface().absorb([{ t: 1, seq: 0, hop: 'relay', ev: 'connect' }]);
  return { sent };
}

test('a reset agent shows what a fresh one shows', () => {
  useEveryPart();
  expect(observe()).not.toEqual(fresh);

  agent.reset();

  expect(observe()).toEqual(fresh);
});

test('a connection made before a reset sends nothing after it', () => {
  const { sent } = useEveryPart();
  const before = sent.length;

  agent.reset();
  flushSync();
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();

  expect(sent.slice(before)).toEqual([]);
});

test('a pick started before a reset no longer takes the page’s clicks', () => {
  useEveryPart();
  agent.reset();

  expect(clickTaken()).toBe(false);
});

function clickTaken(): boolean {
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.body.dispatchEvent(click);
  return click.defaultPrevented;
}

// The overlay highlights and picks in the page itself, with no connection to end them.
test('a highlight the overlay drew is gone after a reset', () => {
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  agent.highlight(agent.allNodes().find((n) => n.name === 'Counter')!.id);

  agent.reset();

  expect(observe().highlighted).toBe(false);
});

test('a pick the overlay started is over after a reset', () => {
  agent.startPick(() => {});

  agent.reset();

  expect(clickTaken()).toBe(false);
});

test('ending a connection after a reset leaves a newer pick alone', () => {
  const end = agent.connect({ send: () => {}, onMessage: () => () => {} });
  agent.reset();
  agent.startPick(() => {});

  end();

  expect(clickTaken()).toBe(true);
});

// Reading a value evaluates it, so a reader left running would keep a $derived the app never reads
// evaluated on every change, as if a panel were still open.
test('after a reset the agent reads none of the app’s values', () => {
  const evaluated = { n: 0 };
  const target = document.body.appendChild(document.createElement('div'));
  mount(UnreadDerived, { target, props: { onEvaluate: () => evaluated.n++ } });
  agent.activate();
  flushSync();
  agent.reset();
  const before = evaluated.n;

  for (let i = 0; i < 3; i++) {
    target.querySelector('button')!.click();
    flushSync();
  }
  expect(evaluated.n).toBe(before);
});

test('after a reset the agent holds no subscription to the app’s stores', () => {
  mount(CountedStore, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  const own = subscribers.n;
  agent.activate();
  flushSync();
  expect(subscribers.n).toBe(own + 1);

  agent.reset();

  expect(subscribers.n).toBe(own);
});
