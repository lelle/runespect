import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import Legacy from '../src/Legacy.svelte';
import LegacyImplicit from '../src/LegacyImplicit.svelte';
import LegacyOptOut from '../src/LegacyOptOut.svelte';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

test('a component without runes joins the tree and reports its values as they change', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Legacy, { target, props: { label: 'hi' } });
  flushSync();

  const node = agent.allNodes().find((n) => n.name === 'Legacy')!;
  expect(agent.read(node.id, 'label')).toBe('hi');
  expect(agent.read(node.id, 'count')).toBe(0);
  expect(agent.read(node.id, 'doubled')).toBe(0);
  expect(agent.read(node.id, '$total')).toBe(10);

  target.querySelector('button')!.click();
  flushSync();
  expect(agent.read(node.id, 'count')).toBe(1);
  expect(agent.read(node.id, 'doubled')).toBe(2);
  expect(target.textContent).toBe('hi: 1 2 10');
});

test('a component without runes or legacy syntax keeps its legacy reactivity', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(LegacyImplicit, { target });
  flushSync();

  target.querySelector('button')!.click();
  flushSync();
  expect(target.textContent).toBe('1 5');
  expect(agent.allNodes().some((n) => n.name === 'LegacyImplicit')).toBe(true);
});

test('a component that opts out of runes mounts and reports its stores', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(LegacyOptOut, { target });
  flushSync();

  const node = agent.allNodes().find((n) => n.name === 'LegacyOptOut')!;
  expect(target.textContent).toBe('7');
  expect(agent.read(node.id, '$total')).toBe(7);
});
