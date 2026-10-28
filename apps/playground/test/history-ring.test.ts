import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import App from '../src/App.svelte';
import type { Commit } from '@runespect/agent/protocol/internal';
import { openPanel } from './helpers/agent';

let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
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
  return { sent, emit: (m: any) => listener?.(m) };
}

test('every ops message is stamped with the commit it belongs to', () => {
  const { sent } = connected();
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();

  const ops = sent.filter((m) => m.kind === 'ops');
  expect(ops.length).toBeGreaterThan(0);
  for (const m of ops) {
    expect(typeof m.commit).toBe('number');
    expect(typeof m.t).toBe('number');
  }
});

// A panel that connects after the fact — which is when you open it — must still see what happened.
test('the agent answers a history request with what it recorded', () => {
  const { sent, emit } = connected();
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();

  emit({ source: 'runespect', kind: 'history-request', since: 0 });

  const history = sent.find((m) => m.kind === 'history');
  expect(history).toBeTruthy();
  expect(Array.isArray(history.commits)).toBe(true);
  expect(history.commits.some((c: Commit) => c.changes.length > 0)).toBe(true);
});

test('a history request only returns what the asker is missing', () => {
  const { sent, emit } = connected();
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();

  emit({ source: 'runespect', kind: 'history-request', since: 0 });
  const all = sent.find((m) => m.kind === 'history').commits as Commit[];
  const latest = all.at(-1)!.seq;

  emit({ source: 'runespect', kind: 'history-request', since: latest });
  const second = sent.filter((m) => m.kind === 'history').at(-1)!.commits as Commit[];

  expect(second.every((c) => c.seq > latest)).toBe(true);
});

test('the reply says whether older history was dropped, rather than pretending it is complete', () => {
  const { sent, emit } = connected();
  emit({ source: 'runespect', kind: 'history-request', since: 0 });
  expect(sent.find((m) => m.kind === 'history').truncated).toBe(false);

  const id = agent.enter('Busy');
  for (let i = 0; i < 210; i++) {
    agent.report(id, 'n', i);
    flushSync();
  }
  emit({ source: 'runespect', kind: 'history-request', since: 0 });
  expect(sent.filter((m) => m.kind === 'history').at(-1).truncated).toBe(true);
});

// The two bounds exist for different failures: the count keeps depth predictable in an ordinary
// app, the byte ceiling stops one commit carrying a huge list from eating the whole budget.
test('the ring is bounded by commit count', () => {
  connected();
  const id = agent.enter('Big');
  for (let i = 0; i < 260; i++) {
    agent.report(id, 'n', i);
    flushSync();
  }

  const all = agent.commits();
  expect(all.length).toBeLessThanOrEqual(200);
  expect(all.at(-1)!.seq).toBeGreaterThan(all[0].seq); // it kept the recent past, not the start
});

test('the ring is bounded by size, so one huge commit cannot fill it', () => {
  connected();
  const id = agent.enter('Heavy');
  // As large as the wire lets one value be (100 entries of 10,000 characters), different each time.
  const heavy = (i: number) =>
    Array.from({ length: 100 }, (_, k) => `${i}:${k}`.padEnd(10_000, 'x'));
  for (let i = 0; i < 60; i++) {
    agent.report(id, 'blob', heavy(i));
    flushSync();
  }

  const all = agent.commits();
  expect(all.length).toBeGreaterThan(0);
  expect(all.length).toBeLessThan(60); // evicted well before the 200-commit limit
  const bytes = all.reduce((sum, c) => sum + JSON.stringify(c).length, 0);
  expect(bytes).toBeLessThanOrEqual(4_000_000);
});

// The plugin connects two transports on every page (window and HMR). A flush is still one thing
// that happened, so it must be one commit, and both transports must stamp it with the same seq.
test('two transports record one commit per flush and stamp it with the same seq', () => {
  const a: any[] = [];
  const b: any[] = [];
  const stopA = agent.connect(openPanel({ send: (m: any) => a.push(m) }));
  const stopB = agent.connect(openPanel({ send: (m: any) => b.push(m) }));
  try {
    const id = agent.enter('Twice');
    agent.report(id, 'n', 1);
    flushSync();
    agent.report(id, 'n', 2);
    flushSync();

    // Two flushes since the panels opened: the mount, then the change.
    expect(agent.commits()).toHaveLength(2);
    const seqs = (sent: any[]) => sent.filter((m) => m.kind === 'ops').map((m) => m.commit);
    expect(seqs(a)).toEqual(agent.commits().map((c) => c.seq));
    expect(seqs(b)).toEqual(seqs(a));
  } finally {
    stopA();
    stopB();
  }
});

test('a transport that connects later still gets the whole tree first', () => {
  const a: any[] = [];
  const stopA = agent.connect(openPanel({ send: (m: any) => a.push(m) }));
  const id = agent.enter('Early');
  agent.report(id, 'n', 1);
  flushSync();

  const b: any[] = [];
  const stopB = agent.connect(openPanel({ send: (m: any) => b.push(m) }));
  try {
    flushSync();
    const tree = b.find((m) => m.kind === 'tree');
    expect(tree.nodes.map((n: any) => n.name)).toEqual(['Early']);
  } finally {
    stopA();
    stopB();
  }
});
