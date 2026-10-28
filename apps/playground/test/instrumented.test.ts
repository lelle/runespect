import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import Counter from '../src/Counter.svelte';
import { agentCall } from '@runespect/vite-plugin/internal';
import { instrumented } from './helpers/instrumented';

// The helper is only worth having if a component given as a string ends up in the agent exactly as
// the same file does when the app compiles it.
test('a component given as a string is instrumented as the same file is', async () => {
  agent.reset();
  agent.activate();
  const target = document.body.appendChild(document.createElement('div'));
  const app = mount(Counter, { target });
  flushSync();
  const [file] = agent.allNodes();
  const fromFile = {
    kinds: file.kinds,
    values: { ...file.values },
    writable: Object.keys(file.values).filter((k) => agent.isWritable(file.id, k)),
  };
  unmount(app);

  const c = await instrumented(
    readFileSync(path.join(import.meta.dirname, '../src/Counter.svelte'), 'utf8'),
    {
      filename: 'Counter.svelte',
    },
  );

  expect(c.node.name).toBe('Counter');
  expect({ kinds: c.kinds, values: c.values, writable: c.writable }).toEqual(fromFile);
});

test('a write through the agent reaches the component', async () => {
  const c = await instrumented(
    `<script>let count = $state(1); let doubled = $derived(count * 2)</script>`,
  );

  expect(c.set('count', 5)).toBe(true);
  expect(c.values).toMatchObject({ count: 5, doubled: 10 });
});

test('until a panel opens, the agent knows the symbols but has read none of them', async () => {
  const c = await instrumented(`<script>let count = $state(1)</script>`, { activate: false });

  expect(c.kinds).toEqual({ count: 'state' });
  expect(c.values).toEqual({});
});

// What the plugin writes into an app's files calls the agent by name; a name the agent does not have
// fails the plugin's type check instead of the app at runtime.
test('the plugin can only write a call to a function the agent has', () => {
  agentCall('component', '{ name: "C", symbols: {} }');
  // @ts-expect-error the agent has no `reportFrm`
  agentCall('reportFrm', 'node');
});
