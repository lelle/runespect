import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import Host from '../src/BindableHost.svelte';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

test('a $bindable prop is editable via the agent and propagates to the parent', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Host, { target });
  flushSync();

  const field = agent.allNodes().find((n) => n.name === 'Field')!;
  expect(agent.read(field.id, 'value')).toBe('hi');
  expect(agent.isWritable(field.id, 'value')).toBe(true);

  agent.setValue(field.id, 'value', 'changed');
  flushSync();

  expect(agent.read(field.id, 'value')).toBe('changed');
  expect(target.querySelector('p')!.textContent).toBe('changed'); // propagated to the parent binding
});
