import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { commitFromOps, indexById } from '@runespect/agent/protocol/internal';
import type { Message, OpsMessage } from '@runespect/agent/protocol/internal';
import Counter from '../src/Counter.svelte';
import Card from '../src/Card.svelte';
import { openPanel } from './helpers/agent';

// Islands: several independent Svelte apps mounted into one document — Astro, or any
// component-per-slot setup. They share one agent module instance, so they land in one tree as
// separate roots. Nothing in runespect treats them specially; these tests exist so that stays true.
let stop: (() => void) | undefined;
beforeEach(() => {
  agent.reset();
  agent.activate();
});
afterEach(() => {
  stop?.();
  stop = undefined;
});

function island<T extends Record<string, unknown>>(
  component: unknown,
  props: T,
): { host: HTMLElement; app: Record<string, unknown> } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = mount(component as any, { target: host, props }) as Record<string, unknown>;
  flushSync();
  return { host, app };
}

test('independently mounted apps become separate roots of one tree', () => {
  island(Counter, { start: 1 });
  island(Card, { title: 'island B' });

  expect(agent.roots().map((r) => r.name)).toEqual(['Counter', 'Card']);
  expect(agent.allNodes().every((n) => n.parent === null || agent.getNode(n.parent))).toBe(true);
});

test('each island reports its own state', () => {
  island(Counter, { start: 7 });
  island(Counter, { start: 100 });

  const counters = agent.allNodes().filter((n) => n.name === 'Counter');
  expect(counters.map((c) => c.values.count)).toEqual([7, 100]);
});

// The point of one shared store: a change in two islands at the same moment is one commit, so you
// can see they moved together. Two separate agents could never show that.
test('a change in two islands lands in the same commit', () => {
  const sent: Message[] = [];
  stop = agent.connect(openPanel({ send: (m) => sent.push(m), onMessage: () => () => {} }));
  const a = island(Counter, { start: 1 });
  const b = island(Counter, { start: 50 });
  flushSync();

  const before = indexById(agent.serialize(1));
  const ids = agent
    .allNodes()
    .filter((n) => n.name === 'Counter')
    .map((n) => n.id);
  agent.setValue(ids[0], 'count', 2);
  agent.setValue(ids[1], 'count', 51);
  flushSync();

  const ops = (sent.filter((m): m is OpsMessage => m.kind === 'ops').at(-1) as OpsMessage).ops;
  const commit = commitFromOps(before, ops, 1, 0);
  const changed = new Set(commit.changes.map((c) => c.id));
  expect(changed.has(ids[0])).toBe(true);
  expect(changed.has(ids[1])).toBe(true);
  void a;
  void b;
});

test('unmounting one island leaves the others standing', () => {
  const a = island(Counter, { start: 1 });
  island(Card, { title: 'stays' });

  unmount(a.app as never);
  flushSync();

  expect(agent.roots().map((r) => r.name)).toEqual(['Card']);
});
