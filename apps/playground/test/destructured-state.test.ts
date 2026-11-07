import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import Destructured from '../src/DestructuredState.svelte';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

test('destructured state is read and edited from the agent, one name at a time', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Destructured, { target });
  flushSync();

  const node = agent.allNodes().find((n) => n.name === 'DestructuredState')!;
  expect(agent.read(node.id, 'a')).toBe(1);
  expect(agent.read(node.id, 'b')).toBe(2);
  expect(agent.isWritable(node.id, 'a')).toBe(true);

  agent.setValue(node.id, 'a', 10);
  agent.setValue(node.id, 'b', 20);
  flushSync();

  expect(agent.read(node.id, 'a')).toBe(10);
  expect(agent.read(node.id, 'b')).toBe(20);
  expect(target.querySelector('p')!.textContent).toBe('10 20');
});
