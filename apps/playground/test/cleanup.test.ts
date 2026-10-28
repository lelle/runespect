import { test, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import App from '../src/App.svelte';
import Toggler from '../src/Toggler.svelte';

beforeEach(() => agent.reset());

function mountInto(Comp: any) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Comp, { target });
  flushSync();
  return { target, app };
}

test('unmounting fully removes nodes — no orphans left behind', () => {
  const { app } = mountInto(App);
  expect(agent.allNodes().length).toBe(3); // App + 2 Counters

  unmount(app);
  flushSync();
  expect(agent.allNodes().length).toBe(0);
});

test('repeated mount/unmount does not accumulate nodes', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  for (let i = 0; i < 5; i++) {
    const app = mount(App, { target });
    flushSync();
    unmount(app);
    flushSync();
  }
  expect(agent.allNodes().length).toBe(0);
});

test('toggling a child off removes its node and detaches it from the parent', () => {
  const { target } = mountInto(Toggler);

  expect(agent.allNodes().some((n) => n.name === 'Counter')).toBe(true);
  expect(agent.allNodes().find((n) => n.name === 'Toggler')!.children.length).toBe(1);

  (target.querySelector('button:last-of-type') as HTMLElement).click(); // the toggle button (Counter renders its own first)
  flushSync();

  expect(agent.allNodes().some((n) => n.name === 'Counter')).toBe(false);
  expect(agent.allNodes().find((n) => n.name === 'Toggler')!.children.length).toBe(0);
});
