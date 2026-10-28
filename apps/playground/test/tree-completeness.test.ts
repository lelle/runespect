import { test, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import StatelessHost from '../src/StatelessHost.svelte';

beforeEach(() => agent.reset());

test('stateless components (no runes, and no <script> at all) still appear in the tree', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(StatelessHost, { target });
  flushSync();

  const names = agent.allNodes().map((n) => n.name);
  expect(names).toContain('StatelessHost');
  expect(names).toContain('Static'); // no <script>
  expect(names).toContain('Bare'); // <script> with no runes

  const host = agent.allNodes().find((n) => n.name === 'StatelessHost')!;
  expect(host.children).toHaveLength(2);
});

test('stateless components are cleaned up on unmount too', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(StatelessHost, { target });
  flushSync();
  expect(agent.allNodes().length).toBe(3); // host + Static + Bare

  unmount(app);
  flushSync();
  expect(agent.allNodes().length).toBe(0);
});
