import { test, expect } from 'vitest';
import { runespectPreprocess } from '@runespect/vite-plugin';
import * as agent from '@runespect/agent/internal';
import { instrumented } from './helpers/instrumented';

const pp = runespectPreprocess({ enabled: true });
const run = (content: string, filename = 'Counter.svelte') =>
  pp.markup({ content, filename })?.code;

test('state, derived and props are reported, and only state can be edited', async () => {
  const c = await instrumented(
    `<script>
  let { start = 0 } = $props();
  let count = $state(start);
  let doubled = $derived(count * 2);
</script>
<button>{count}</button>`,
    { filename: 'Counter.svelte', props: { start: 2 } },
  );

  expect(c.node.name).toBe('Counter');
  expect(c.values).toEqual({ count: 2, doubled: 4, start: 2 });
  expect(c.writable).toEqual(['count']);
});

// One agent per page depends on the exact module the injected code imports: the plugin resolves
// that id to the agent it was released with.
test('the injected code imports the agent the plugin resolves', () => {
  expect(run(`<script>let count = $state(0);</script>`)).toContain(
    'from "@runespect/agent/runtime"',
  );
});

test('each reported symbol is tagged with what it is', async () => {
  const c = await instrumented(`<script>
  import { writable } from 'svelte/store';
  let { label = '' } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
  const store = writable(1);
</script>
<p>{$store} {label}</p>`);

  expect(c.kinds).toEqual({ count: 'state', doubled: 'derived', label: 'prop', $store: 'store' });
});

test('the reactive fields of a class instance are reported as class fields', async () => {
  const c = await instrumented(`<script>
  class Box { value = $state(1); double = $derived(this.value * 2); }
  let box = new Box();
</script>`);

  expect(c.kinds).toMatchObject({ 'box.value': 'class', 'box.double': 'class' });
  expect(c.values).toMatchObject({ 'box.value': 1, 'box.double': 2 });
});

test('a context the component reads is reported, read-only', async () => {
  const c = await instrumented(
    `<script>
  import { getContext } from 'svelte';
  const theme = getContext('theme');
  let local = $state(0);
</script>`,
    { context: new Map([['theme', 'dark']]) },
  );

  expect(c.kinds).toEqual({ theme: 'context', local: 'state' });
  expect(c.values).toMatchObject({ theme: 'dark' });
  expect(c.writable).not.toContain('theme');
});

test('what the component provides with setContext is reported as one object', async () => {
  const c = await instrumented(`<script>
  import { setContext } from 'svelte';
  let theme = $state('dark');
  setContext('greeting', 'hi');
  setContext('theme', theme);
</script>`);

  expect(c.kinds).toMatchObject({ provided: 'context-set' });
  expect(c.values).toMatchObject({ provided: { greeting: 'hi', theme: 'dark' } });
});

// Reporting a value means evaluating it again; a call or a `new` would run the app's code twice.
test('a provided value made by a call is not reported, so the call runs only once', async () => {
  const calls = { n: 0 };
  (globalThis as { __calls?: typeof calls }).__calls = calls;
  const c = await instrumented(`<script>
  import { setContext } from 'svelte';
  function compute() { globalThis.__calls.n++; return 1; }
  class Thing {}
  setContext('x', compute());
  setContext('y', new Thing());
</script>`);

  expect(c.kinds).not.toHaveProperty('provided');
  expect(calls.n).toBe(1);
});

test('a component without runes joins the tree with nothing to report, and leaves it', async () => {
  const c = await instrumented(`<script>\n  const x = 1;\n</script>\n<p>hi</p>`);

  expect(c.readable).toEqual([]);
  c.unmount();
  expect(agent.allNodes()).toEqual([]);
});

test('respects include filter', () => {
  const scoped = runespectPreprocess({ enabled: true, include: /Plain\.svelte$/ });
  const src = `<script>\n  let c = $state(0);\n</script>`;
  expect(scoped.markup({ content: src, filename: 'Counter.svelte' })).toBeUndefined();
  expect(scoped.markup({ content: src, filename: 'FooPlain.svelte' })).toBeTruthy();
});

// SvelteKit's generated root holds the router's props (constructors, components, data_0…), not the
// app's; the app's own top layout is the root a developer expects.
test("SvelteKit's generated root component is not instrumented", () => {
  const src = `<script>\n  let { constructors, components = [] } = $props();\n</script>`;
  const root = '/app/.svelte-kit/generated/root.svelte';
  expect(pp.markup({ content: src, filename: root })).toBeUndefined();
  expect(pp.markup({ content: src, filename: '/app/src/routes/+layout.svelte' })).toBeTruthy();
});

test('const state is reported but never reassigned, so the component keeps compiling', async () => {
  const c = await instrumented(`<script>\n  const items = $state([]);\n</script>`);

  expect(c.readable).toEqual(['items']);
  expect(c.writable).toEqual([]);
});
