import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import StoreComp from '../src/StoreComp.svelte';
import ClassComp from '../src/ClassComp.svelte';
import ReactivityComp from '../src/ReactivityComp.svelte';
import { openPanel } from './helpers/agent';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

function mountInto(Comp: any) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Comp, { target });
  flushSync();
  return target;
}

test('a store auto-subscription is reported live and read-only', () => {
  const target = mountInto(StoreComp);
  const node = agent.allNodes()[0];

  expect(agent.read(node.id, '$n')).toBe(5);
  expect(agent.isWritable(node.id, '$n')).toBe(false);

  target.querySelector('button')!.click();
  flushSync();
  expect(agent.read(node.id, '$n')).toBe(6);
});

test('reactive class fields are reported per-field and $state fields are editable', () => {
  const target = mountInto(ClassComp);
  const node = agent.allNodes()[0];

  expect(agent.read(node.id, 'c.n')).toBe(3);
  expect(agent.read(node.id, 'c.double')).toBe(6);
  expect(agent.isWritable(node.id, 'c.n')).toBe(true);
  expect(agent.isWritable(node.id, 'c.double')).toBe(false);

  agent.setValue(node.id, 'c.n', 10);
  flushSync();
  expect(target.querySelector('button')!.textContent).toBe('10 / 20');
  expect(agent.read(node.id, 'c.double')).toBe(20);
});

// jsdom has no matchMedia: a query that matches until the test says otherwise.
const query = Object.assign(new EventTarget(), { matches: true });
beforeEach(() => {
  query.matches = true;
  window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
});

test('a SvelteSet and a SvelteMap are reported live and read-only', () => {
  const target = mountInto(ReactivityComp);
  const node = agent.allNodes()[0];

  expect([...(agent.read(node.id, 'tags') as Set<string>)]).toEqual(['new']);
  expect(agent.isWritable(node.id, 'tags')).toBe(false);

  const [addTag, sell] = target.querySelectorAll('button');
  addTag.click();
  sell.click();
  flushSync();
  expect([...(agent.read(node.id, 'tags') as Set<string>)]).toEqual(['new', 'sale']);
  expect((agent.read(node.id, 'stock') as Map<string, number>).get('apple')).toBe(2);
});

// Live means the panel is told: the change has to reach the wire, not only the page's own object.
test('a SvelteURLSearchParams, MediaQuery, SvelteDate and SvelteURL are reported live', () => {
  const stop = agent.connect(openPanel({ send: () => {}, onMessage: () => () => {} }));
  const target = mountInto(ReactivityComp);
  const before = agent.commits().length;

  const buttons = target.querySelectorAll('button');
  buttons[2].click();
  buttons[3].click();
  buttons[4].click();
  query.matches = false;
  query.dispatchEvent(new Event('change'));
  flushSync();
  stop();

  const changes = agent
    .commits()
    .slice(before)
    .flatMap((c) => c.changes);
  expect(changes.find((c) => c.symbol === 'params')?.to).toEqual({
    __runespect: 'urlsearchparams',
    entries: [
      ['q', 'apple'],
      ['q', 'pear'],
    ],
  });
  expect(changes.find((c) => c.symbol === 'wide')?.to).toEqual({
    __runespect: 'instance',
    name: 'MediaQuery',
    fields: { current: false },
  });
  expect(changes.find((c) => c.symbol === 'due')?.to).toEqual({
    __runespect: 'date',
    iso: '2027-01-01T00:00:00.000Z',
  });
  expect(changes.find((c) => c.symbol === 'link')?.to).toMatchObject({
    __runespect: 'instance',
    name: 'SvelteURL',
    fields: { href: 'https://shop.example/checkout' },
  });
});

test('a reactive value whose `current` throws is shown with that error, not as a failed read', () => {
  agent.enter('Broken', null);
  const node = agent.allNodes()[0];
  class Failing {
    get current(): never {
      throw new Error('no window');
    }
  }
  agent.reportFrom(node.id, 'wide', () => new Failing());
  flushSync();
  expect(agent.read(node.id, 'wide')).toBeInstanceOf(Failing);
});

// Like React DevTools' $r: the app's own object, so a call on it changes the app.
test('store as global gives the app’s own value, not a copy', () => {
  const id = agent.enter('Live', null);
  const items = ['a'];
  const params = new URLSearchParams('q=apple');
  agent.reportFrom(id, 'items', () => items);
  agent.reportFrom(id, 'params', () => params);
  const $r = () => (window as unknown as { $r: unknown }).$r;
  const log = console.log;
  console.log = () => {};
  try {
    agent.storeGlobal(id, 'items');
    expect($r()).toBe(items);
    agent.storeGlobal(id, 'params');
    expect($r()).toBe(params);
  } finally {
    console.log = log;
  }
});

// The same SvelteDate holds the new time: the agent has to read it to hear the change at all.
test('a SvelteDate that changes alone reaches the panel', () => {
  const stop = agent.connect(openPanel({ send: () => {}, onMessage: () => () => {} }));
  const target = mountInto(ReactivityComp);
  const before = agent.commits().length;

  target.querySelectorAll('button')[3].click();
  flushSync();
  stop();

  const changes = agent
    .commits()
    .slice(before)
    .flatMap((c) => c.changes);
  expect(changes.map((c) => c.symbol)).toEqual(['due']);
});
