import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import type { RunespectSurface } from '@runespect/agent';
import Counter from '../src/Counter.svelte';
import CardHost from '../src/CardHost.svelte';

// window.__runespect as a developer or a coding agent with a browser tool reads it: the tree, the
// values, the history and edits, as plain data.
let app: Record<string, unknown> | undefined;
let stop: (() => void) | undefined;
let target: HTMLElement;
beforeEach(() => agent.reset());
afterEach(() => {
  vi.restoreAllMocks();
  stop?.();
  stop = undefined;
  if (app) unmount(app);
  app = undefined;
});

function start(component: any, props: Record<string, unknown> = {}): RunespectSurface {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(component, { target, props });
  stop = agent.connect({ send: () => {}, onMessage: () => () => {} });
  flushSync();
  return (globalThis as unknown as { __runespect: RunespectSurface }).__runespect;
}

test('tree() lists the components with their parents, as plain data', () => {
  const rs = start(CardHost);
  const tree = rs.tree();
  const host = tree.find((n) => n.name === 'CardHost')!;
  const card = tree.find((n) => n.name === 'Card')!;
  expect(card.parent).toBe(host.id);
  expect(host.loc).toMatch(/CardHost\.svelte$/);
  expect(structuredClone(tree)).toEqual(tree);
});

test('find() matches names the way the panel search does: a substring, or a /regex/', () => {
  const rs = start(CardHost);
  expect(rs.find('card').map((n) => n.name)).toEqual(['CardHost', 'Card']);
  expect(rs.find('/^Card$/').map((n) => n.name)).toEqual(['Card']);
  expect(rs.find('/[/')).toEqual([]);
});

test('values() groups a component’s values by kind', () => {
  const rs = start(Counter, { start: 2 });
  const [counter] = rs.find('Counter');
  expect(rs.values(counter.id)).toEqual({
    prop: { start: 2 },
    state: { count: 2 },
    derived: { doubled: 4 },
  });
  expect(rs.values(9999)).toBeNull();
});

test('set() changes a value the way an edit from the panel does, and history records it', () => {
  const rs = start(Counter);
  const [counter] = rs.find('Counter');
  const before = rs.history().length;

  expect(rs.set(counter.id, 'count', 5)).toBe(true);
  flushSync();
  expect(target.textContent).toContain('5 / 10');
  expect(rs.values(counter.id)!.derived).toEqual({ doubled: 10 });

  const latest = rs.history(rs.history()[before - 1]?.seq ?? 0);
  expect(latest.length).toBeGreaterThan(0);
  expect(JSON.stringify(latest)).toContain('count');
});

// It still answers false, so `if (!set(…))` keeps working; why goes to the console and the event log.
type SetArgs = Parameters<RunespectSurface['set']>;
const refusals = (rs: RunespectSurface) =>
  rs.events.filter((e) => e.ev === 'refused').map((e) => [e.id, e.error]);

function warnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

test.each([
  {
    refusal: 'unknown-component',
    args: (): SetArgs => [9999, 'count', 1],
    says: () => `set(9999, 'count') did nothing: there is no component 9999`,
  },
  {
    refusal: 'unknown-symbol',
    args: (id: number): SetArgs => [id, 'cuont', 1],
    says: (id: number) => `set(${id}, 'cuont') did nothing: Counter has no 'cuont'`,
  },
  {
    refusal: 'not-writable',
    args: (id: number): SetArgs => [id, 'doubled', 1],
    says: (id: number) => `set(${id}, 'doubled') did nothing: 'doubled' in Counter is not writable`,
  },
  {
    refusal: 'bad-path',
    args: (id: number): SetArgs => [id, 'count', 1, ['digits']],
    says: (id: number) => `set(${id}, 'count') did nothing: 'count' cannot be set at ["digits"]`,
  },
  {
    refusal: 'carries-marker',
    args: (id: number): SetArgs => [id, 'count', { __runespect: 'object' }],
    says: (id: number) =>
      `set(${id}, 'count') did nothing: the value holds a placeholder for something not loaded`,
  },
])('set() refuses $refusal, and says why', ({ refusal, args, says }) => {
  const warn = warnings();
  const rs = start(Counter);
  const [counter] = rs.find('Counter');
  const call = args(counter.id);

  expect(rs.set(...call)).toBe(false);
  expect(warn).toHaveBeenCalledWith(`[runespect] ${says(counter.id)}`);
  expect(refusals(rs)).toEqual([[call[0], refusal]]);
});

test('set() on a component that has unmounted says so, apart from an id the page never had', () => {
  const warn = warnings();
  const rs = start(Counter);
  const [counter] = rs.find('Counter');
  unmount(app!);
  app = undefined;
  flushSync();

  expect(rs.set(counter.id, 'count', 5)).toBe(false);
  expect(warn).toHaveBeenCalledWith(
    `[runespect] set(${counter.id}, 'count') did nothing: component ${counter.id} has unmounted`,
  );
  expect(refusals(rs)).toEqual([[counter.id, 'unmounted']]);
});

test('set() that works says nothing', () => {
  const warn = warnings();
  const rs = start(Counter);
  const [counter] = rs.find('Counter');

  expect(rs.set(counter.id, 'count', 5)).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  expect(refusals(rs)).toEqual([]);
});

// An array takes the indexes it has, and the next one to append, as an object takes a new key.
test.each([
  { path: [1], applied: ['a', 'x', 'c'] },
  { path: [3], applied: ['a', 'b', 'c', 'x'] },
  { path: ['1'], applied: ['a', 'x', 'c'] },
  { path: [99], applied: null },
  { path: [-1], applied: null },
  { path: [1.5], applied: null },
  { path: ['foo'], applied: null },
  { path: [4, 'deep'], applied: null },
])('set() at $path into an array of three', ({ path, applied }) => {
  warnings();
  const rs = start(Counter);
  const id = agent.enter('List', null, { kinds: { items: 'state' } });
  agent.report(id, 'items', ['a', 'b', 'c']);
  agent.bind(id, 'items', (v) => agent.report(id, 'items', v));

  expect(rs.set(id, 'items', 'x', path)).toBe(applied !== null);
  expect(agent.read(id, 'items')).toEqual(applied ?? ['a', 'b', 'c']);
  expect(refusals(rs)).toEqual(applied ? [] : [[id, 'bad-path']]);
});

test('inspect() reads below the first level, as the panel fetches it', () => {
  const id = agent.enter('C');
  agent.report(id, 'config', { theme: { mode: 'dark' } });
  const rs = start(Counter);
  expect(rs.values(id)!.value.config).toMatchObject({ theme: { __runespect: 'dehydrated' } });
  expect(rs.inspect(id, ['config', 'theme'])).toEqual({ mode: 'dark' });
});
