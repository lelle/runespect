import { test, expect, beforeEach, afterEach } from 'vitest';
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

test('set() refuses what it cannot write, and says so', () => {
  const rs = start(Counter);
  const [counter] = rs.find('Counter');
  expect(rs.set(counter.id, 'doubled', 1)).toBe(false); // a derived
  expect(rs.set(9999, 'count', 1)).toBe(false);
});

test('inspect() reads below the first level, as the panel fetches it', () => {
  const id = agent.enter('C');
  agent.report(id, 'config', { theme: { mode: 'dark' } });
  const rs = start(Counter);
  expect(rs.values(id)!.value.config).toMatchObject({ theme: { __runespect: 'dehydrated' } });
  expect(rs.inspect(id, ['config', 'theme'])).toEqual({ mode: 'dark' });
});
