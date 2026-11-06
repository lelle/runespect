import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import {
  helloMessage,
  treeMessage,
  opsMessage,
  PROTOCOL_VERSION,
  type Message,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';
import { gapWarner, hearNumber, type Gap, type Numbers } from '@runespect/ui/internal';
import App from '../src/App.svelte';
import { openPanel } from './helpers/agent';
import { mountPanel, node } from './helpers/panel';

// Every message a page sends carries `n`, one more than the last, so a panel can tell a message
// lost on the way from one never sent. The panel reports a gap, and asks the page it follows for its
// tree again, whatever was lost.

let disconnect: (() => void) | undefined;
beforeEach(() => {
  agent.reset();
  localStorage.clear();
});
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  vi.restoreAllMocks();
});

function connected(refuse: (m: Message) => boolean = () => false) {
  const sent: Message[] = [];
  disconnect = agent.connect(
    openPanel({
      send: (m) => {
        if (refuse(m)) throw new DOMException('could not be cloned', 'DataCloneError');
        sent.push(m);
      },
    }),
  );
  return sent;
}

const mountApp = () => {
  mount(App, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
};

test('a page numbers everything it sends, across kinds, from 1', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sent = connected();
  mountApp();

  expect(sent.map((m) => m.kind)).toEqual(expect.arrayContaining(['hello', 'tree']));
  expect(sent.map((m) => (m as { n?: number }).n)).toEqual(sent.map((_, i) => i + 1));
});

test('a send the transport refuses still uses up its number, so the panel sees the gap', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const sent = connected((m) => m.kind === 'tree');
  mountApp();

  const ns = sent.map((m) => (m as { n?: number }).n!);
  expect(ns[0]).toBe(1);
  expect(ns.some((n, i) => i > 0 && n !== ns[i - 1] + 1)).toBe(true);
});

test('a new connection counts from 1 again', () => {
  connected();
  disconnect?.();
  const sent = connected();

  expect((sent[0] as { n?: number }).n).toBe(1);
});

// ── the panel's side, as a reducer ──

const from = (id: string, n?: number): ToPanelMessage => ({
  ...treeMessage([]),
  from: id,
  ...(n === undefined ? {} : { n }),
});

function hear(...messages: ToPanelMessage[]) {
  let numbers: Numbers = new Map();
  const gaps: Gap[] = [];
  const stale: boolean[] = [];
  for (const msg of messages) {
    const step = hearNumber(numbers, msg);
    numbers = step.numbers;
    if (step.gap) gaps.push(step.gap);
    stale.push(step.stale);
  }
  return { gaps, stale };
}

test('numbers in a row are no gap, and the first one heard is where the panel starts', () => {
  expect(hear(from('a', 17), from('a', 18), from('b', 1), from('a', 19)).gaps).toEqual([]);
});

test('a number skipped is a gap, per page', () => {
  const { gaps, stale } = hear(from('a', 1), from('b', 1), from('a', 3), from('b', 2));

  expect(gaps).toEqual([{ from: 'a', expected: 2, got: 3 }]);
  expect(stale).toEqual([false, false, false, false]);
});

test('a number heard before is a gap too, and stale', () => {
  const { gaps, stale } = hear(from('a', 1), from('a', 2), from('a', 2));

  expect(gaps).toEqual([{ from: 'a', expected: 3, got: 2 }]);
  expect(stale).toEqual([false, false, true]);
});

// One page load can connect again (a reset in tests, a transport made anew): it counts from 1.
test('a page that starts again from 1 is no gap', () => {
  const { gaps, stale } = hear(from('a', 5), from('a', 1), from('a', 2));

  expect(gaps).toEqual([]);
  expect(stale).toEqual([false, false, false]);
});

test('a message without a sender or a number is not counted', () => {
  expect(hear(from('a', 1), { ...treeMessage([]) }, from('a'), from('a', 2)).gaps).toEqual([]);
});

// ── the panel ──

const hello = (id: string, n: number, url = '/'): Message => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title: url }),
  from: id,
  n,
});
const ops = (id: string, n: number, commit: number, count: number): Message => ({
  ...opsMessage([{ op: 'update', node: node(1, 'Counter', { count }) }], commit, commit),
  from: id,
  n,
});
const tree = (id: string, n: number, name = 'Counter'): Message => ({
  ...treeMessage([node(1, name, { count: 1 })]),
  from: id,
  n,
});
const asked = (sent: Message[]) =>
  sent.map((m) => `${m.kind}${'to' in m && m.to ? ` ${m.to}` : ''}`);

function panel() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const gaps: Gap[] = [];
  const p = mountPanel({ onGap: (gap: Gap) => gaps.push(gap) });
  const names = () => p.target.querySelector('[role="tree"]')?.textContent ?? '';
  const commit = (seq: number) => {
    p.click('[data-tab="history"]');
    const found = p.target.querySelector(`[data-commit="${seq}"]`) !== null;
    p.click('[data-tab="tree"]');
    return found;
  };
  return { ...p, warn, gaps, names, commit };
}

test('a gap in ops from the page it follows: reported, not applied, its tree and whole history asked again', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(tree('a', 2));
  p.emit(ops('a', 3, 1, 2));
  const before = p.sent.length;

  p.emit(ops('a', 5, 3, 4));

  expect(p.gaps).toEqual([{ from: 'a', expected: 4, got: 5 }]);
  expect(p.sent.slice(before)).toEqual([
    expect.objectContaining({ kind: 'request', to: 'a' }),
    expect.objectContaining({ kind: 'history-request', since: 0, to: 'a' }),
  ]);
  expect(p.commit(1)).toBe(true);
  expect(p.commit(3)).toBe(false);
});

// Only ops build on what came before; a tree, a picked or a hydrate stands on its own.
test('a message that stands on its own is applied even when it shows a gap', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(tree('a', 2));

  p.emit(tree('a', 4, 'Fresh'));

  expect(p.gaps).toEqual([{ from: 'a', expected: 3, got: 4 }]);
  expect(p.names()).toContain('Fresh');
});

// A tree the transport always refuses uses up its number each time: each answer would show a new
// gap, and asking again for each would never end. A tree only lost on the way needs another ask.
test('gaps from the page it follows ask for its tree at most three times, until a tree comes', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(tree('a', 2));
  const before = p.sent.length;

  for (let n = 4; n <= 12; n += 2) p.emit(ops('a', n, n, n));

  expect(p.gaps).toHaveLength(5);
  expect(asked(p.sent.slice(before)).filter((k) => k === 'request a')).toHaveLength(3);

  p.emit(tree('a', 13));
  p.emit(ops('a', 15, 15, 15));
  expect(asked(p.sent.slice(before)).filter((k) => k === 'request a')).toHaveLength(4);
});

test('a gap from a page it does not follow is reported, and nothing is sent', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(hello('b', 1, '/admin'));
  p.emit(hello('b', 2, '/admin'));
  const before = p.sent.length;

  p.emit(hello('b', 4, '/admin/users'));

  expect(p.gaps).toEqual([{ from: 'b', expected: 3, got: 4 }]);
  expect(p.sent.slice(before)).toEqual([]);
});

test('numbers in a row: nothing reported, nothing sent', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(tree('a', 2));
  const before = p.sent.length;

  p.emit(ops('a', 3, 1, 2));

  expect(p.gaps).toEqual([]);
  expect(p.sent.slice(before)).toEqual([]);
});

test('a message heard twice from the page it follows is reported and dropped, and nothing asked', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(tree('a', 2));
  p.emit(ops('a', 3, 1, 2));
  const before = p.sent.length;

  p.emit(tree('a', 2, 'Stale'));

  expect(p.gaps).toEqual([{ from: 'a', expected: 4, got: 2 }]);
  expect(p.names()).toContain('Counter');
  expect(p.names()).not.toContain('Stale');
  expect(p.sent.slice(before)).toEqual([]);
});

// The panel can run inside the inspected page, whose console is the app's: a gap goes to onGap.
test('the panel itself warns in no console', () => {
  const p = panel();
  p.emit(hello('a', 1));
  p.emit(hello('a', 3));

  expect(p.gaps).toHaveLength(1);
  expect(p.warn).not.toHaveBeenCalled();
});

// The panel window is a page of its own, so its console is runespect's.
test('the panel window warns once per page, and names it', () => {
  const warn = vi.fn();
  const onGap = gapWarner(warn);
  onGap({ from: 'a', expected: 2, got: 3 });
  onGap({ from: 'a', expected: 4, got: 6 });
  onGap({ from: 'b', expected: 2, got: 3 });

  expect(warn).toHaveBeenCalledTimes(2);
  expect(String(warn.mock.calls[0][0])).toContain('page a');
});
