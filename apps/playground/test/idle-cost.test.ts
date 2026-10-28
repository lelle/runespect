import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import Bench from '../src/Bench.svelte';
import { openPanel } from './helpers/agent';

// What runespect costs an app on every flush, whether or not a panel is open.
let app: Record<string, unknown> | undefined;
let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
  if (app) unmount(app);
  app = undefined;
});

function bench(n: number): (() => void)[] {
  const bumps: (() => void)[] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(Bench, { target, props: { n, register: (bump) => bumps.push(bump) } });
  flushSync();
  stop = agent.connect(openPanel({ send: () => {}, onMessage: () => () => {} }));
  flushSync();
  return bumps;
}

function errorsMadeDuring(run: () => void): number {
  const RealError = globalThis.Error;
  let made = 0;
  globalThis.Error = class extends RealError {
    constructor(...args: ConstructorParameters<ErrorConstructor>) {
      super(...args);
      made++;
    }
  } as ErrorConstructor;
  try {
    run();
  } finally {
    globalThis.Error = RealError;
  }
  return made;
}

// In dev, Svelte records a stack trace for a signal set more than five times in one flush (its
// infinite-loop diagnostics). One shared signal set once per reported value would make that thousands
// of stack traces per flush in a large app.
test('a flush where many components report takes no stack traces', () => {
  const bumps = bench(50);
  const made = errorsMadeDuring(() => {
    for (const bump of bumps) bump();
    flushSync();
  });
  expect(made).toBe(0);
});

// Diffing the whole tree on every flush would make one click in a large app cost in proportion to
// the app.
// Comparing a node costs a JSON.stringify of it before and after, so the count tracks the nodes
// the agent looked at.
function comparisonsWhenOneChanges(n: number): number {
  const bumps = bench(n);
  const stringify = vi.spyOn(JSON, 'stringify');
  bumps[0]();
  flushSync();
  const calls = stringify.mock.calls.length;
  stringify.mockRestore();
  stop?.();
  stop = undefined;
  if (app) unmount(app);
  app = undefined;
  agent.reset();
  return calls;
}

test('when one component changes, the work does not grow with the tree', () => {
  const small = comparisonsWhenOneChanges(20);
  const large = comparisonsWhenOneChanges(200);
  expect(small).toBeGreaterThan(0); // the change is seen at all
  expect(large).toBe(small);
});
