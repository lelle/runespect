import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import App from '../src/App.svelte';

// App/Counter are clean source — instrumentation is injected automatically by
// runespectPreprocess, scoped to playground/src in vitest.config.ts.
beforeEach(() => {
  agent.reset();
  agent.activate();
});

function mountApp() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();
  return target;
}

test('auto-instrumentation reconstructs tree + live values + props', () => {
  const target = mountApp();
  const nodes = agent.allNodes();

  const app = nodes.find((n) => n.name === 'App')!;
  const counters = nodes.filter((n) => n.name === 'Counter');
  expect(counters).toHaveLength(2);
  for (const c of counters) expect(c.parent).toBe(app.id);

  const c1 = counters[0];
  expect(agent.read(c1.id, 'count')).toBe(1);
  expect(agent.read(c1.id, 'doubled')).toBe(2);
  expect(agent.read(c1.id, 'start')).toBe(1);
  expect(agent.read(app.id, 'title')).toBe('runespect');
  expect(agent.read(counters[1].id, 'count')).toBe(10);

  target.querySelectorAll('button')[0].click();
  flushSync();
  expect(agent.read(c1.id, 'count')).toBe(2);
  expect(agent.read(c1.id, 'doubled')).toBe(4);
});

test('editing via the agent flows back into the app', () => {
  const target = mountApp();
  const c1 = agent.allNodes().find((n) => n.name === 'Counter')!;

  agent.setValue(c1.id, 'count', 99);
  flushSync();
  expect(target.querySelectorAll('button')[0].textContent).toBe('99 / 198');
});

test('app behaviour is unchanged by instrumentation', () => {
  const target = mountApp();
  const btn = target.querySelectorAll('button')[0];
  expect(btn.textContent).toBe('1 / 2');
  btn.click();
  flushSync();
  expect(btn.textContent).toBe('2 / 4');
  expect(target.querySelectorAll('button')[1].textContent).toBe('10 / 20');
});
