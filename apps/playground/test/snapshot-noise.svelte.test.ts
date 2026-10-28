import { test, expect, vi, afterEach } from 'vitest';
import { snap } from '@runespect/agent/internal';

afterEach(() => vi.restoreAllMocks());

const warnings = () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    messages: () => warn.mock.calls.map((c) => String(c[0])),
  };
};

// $state.snapshot() warns (state_snapshot_uncloneable) for every function it meets, and returns the
// original anyway. Those warnings land in the INSPECTED app's console, not ours — a devtool must
// not make an app look broken. Values holding methods (services, stores, class instances) are the
// normal case in a real app.
test('snap: a value holding methods is passed through without warning the app', () => {
  const w = warnings();
  const services = { findProduct: () => 1, getOrder: () => 2, count: 3 };

  const out = snap(services) as typeof services;

  expect(w.messages().filter((m) => m.includes('state_snapshot_uncloneable'))).toHaveLength(0);
  expect(out.count).toBe(3);
});

test('snap: a class instance is passed through without warning the app', () => {
  const w = warnings();
  class Wizard {
    step = 1;
    next(): void {}
  }

  expect((snap(new Wizard()) as Wizard).step).toBe(1);
  expect(w.messages().filter((m) => m.includes('state_snapshot_uncloneable'))).toHaveLength(0);
});

test('snap: plain reactive state is still snapshotted, so the panel sees values not proxies', () => {
  const state = $state({ a: 1, nested: { b: 2 } });
  const out = snap(state) as { a: number; nested: { b: number } };

  expect(out).toEqual({ a: 1, nested: { b: 2 } });
  expect(out).not.toBe(state); // a real copy, detached from the app's reactivity
});

// The functions can sit at any depth — a services bag nested inside the state object is a common
// shape. Walking every value to find them would cost more than the
// snapshot itself, so the warning is silenced around our own call instead: it is a warning about
// what runespect asked for, addressed to a developer who did not ask for it.
test('snap: methods nested deeper in the value do not warn the app either', () => {
  const w = warnings();
  const state = $state({
    step: 1,
    shopServices: { findProduct: () => 1, getOrder: () => 2 },
  });

  const out = snap(state) as { step: number };

  expect(w.messages().filter((m) => m.includes('state_snapshot_uncloneable'))).toHaveLength(0);
  expect(out.step).toBe(1);
});

test('snap: other Svelte warnings still reach the app — only our own noise is filtered', () => {
  const w = warnings();
  const plain = $state({ a: 1 });
  snap(plain);
  console.warn('[svelte] something_else_entirely');

  expect(w.messages()).toContain('[svelte] something_else_entirely');
});
