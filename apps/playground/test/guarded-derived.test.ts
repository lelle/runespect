import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { svelteAtLeast } from './svelte-version';
import GuardedDerived from '../src/GuardedDerived.svelte';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

function mountAndOpenGuard() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(GuardedDerived, { target });
  flushSync();

  const node = agent.allNodes().find((n) => n.name === 'GuardedDerived')!;
  const before = agent.read(node.id, 'name');
  target.querySelector('button')!.click();
  flushSync();
  return { target, node, before };
}

test('a derived that is only valid behind a guard does not break the component', () => {
  const { target, before } = mountAndOpenGuard();
  expect(before).toMatchObject({ __runespect: 'error' });
  expect(target.querySelector('p')!.textContent).toBe('Ada');
});

// Before Svelte 5.57.0 the reporting effect keeps the derived's error after the guard opens: the
// app shows the value, the panel still shows the error.
test.skipIf(!svelteAtLeast('5.57.0'))('the derived is read again once the guard opens', () => {
  const { node } = mountAndOpenGuard();
  expect(agent.read(node.id, 'name')).toBe('Ada');
});
