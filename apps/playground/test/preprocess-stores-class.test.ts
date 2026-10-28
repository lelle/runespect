import { test, expect } from 'vitest';
import path from 'node:path';
import { runespectPreprocess } from '@runespect/vite-plugin';
import * as agent from '@runespect/agent/internal';
import { instrumented } from './helpers/instrumented';
import { Box } from '../src/syntax/box.svelte';

const pp = runespectPreprocess({ enabled: true });
const run = (content: string, filename = 'C.svelte') => pp.markup({ content, filename })?.code;
const COUNTED_STORE = path.join(import.meta.dirname, '../src/modules/counted-store.ts');
const BOX = path.join(import.meta.dirname, '../src/syntax/box.svelte.ts');

test('a store the component reads with $ is reported, read-only', async () => {
  const c = await instrumented(
    `<script>
  import { writable } from 'svelte/store';
  const count = writable(3);
  let { label } = $props();
</script>
<p>{$count}</p>`,
    { props: { label: 'a' } },
  );

  expect(c.values).toEqual({ $count: 3, label: 'a' });
  expect(c.writable).toEqual([]);
});

test('the reactive fields of a class are reported one by one, private ones left out', async () => {
  const c = await instrumented(`<script>
  class Box {
    value = $state(1);
    double = $derived(this.value * 2);
    #secret = $state(1);
  }
  let box = new Box();
</script>`);

  expect(c.readable).toEqual(['box.value', 'box.double']);
  expect(c.writable).toEqual(['box.value']);
  expect(c.set('box.value', 3)).toBe(true);
  expect(c.values).toEqual({ 'box.value': 3, 'box.double': 6 });
});

test('an instance of a class that is not reactive is left out', async () => {
  const c = await instrumented(`<script>
  let d = new Date();
  let x = $state(1);
</script>`);

  expect(c.readable).toEqual(['x']);
});

test('an instance of a svelte/reactivity class is reported as read-only state', async () => {
  const c = await instrumented(`<script>
  import { SvelteSet, SvelteMap as Stock, SvelteDate } from 'svelte/reactivity';
  const tags = new SvelteSet(['a']);
  let stock = new Stock();
  const today = new SvelteDate();
  let x = $state(1);
</script>`);

  expect(c.readable).toEqual(expect.arrayContaining(['tags', 'stock', 'today']));
  expect(c.writable).toEqual(['x']);
  expect(c.kinds).toMatchObject({ tags: 'state' });
});

test('a namespace import of svelte/reactivity is followed; a type-only import is not', async () => {
  // A type-only import is gone at runtime, so `new` here reaches these.
  Object.assign(globalThis, { SvelteMap: class {}, SvelteDate: class {} });
  const c = await instrumented(`<script lang="ts">
  import * as R from 'svelte/reactivity';
  import { type SvelteMap } from 'svelte/reactivity';
  import type { SvelteDate } from 'svelte/reactivity';
  const tags = new R.SvelteSet();
  const stock = new SvelteMap();
  const today = new SvelteDate();
  let x = $state(1);
</script>`);

  expect(c.readable).toEqual(['tags', 'x']);
});

test('a class named like one from svelte/reactivity, but declared elsewhere, is left out', async () => {
  const c = await instrumented(`<script>
  class SvelteSet extends Set {}
  const tags = new SvelteSet();
  let x = $state(1);
</script>`);

  expect(c.readable).toEqual(['x']);
});

test('an imported store is reported, but `$`-named keys and members are not stores', async () => {
  const c = await instrumented(`<script>
  import { counted } from ${JSON.stringify(COUNTED_STORE)};
  const q = $state({ $in: [1] });
</script>
<p>{$counted} {q.$in}</p>`);

  expect(c.values).toEqual({ q: { $in: [1] }, $counted: 7 });
});

test('a component with neither runes nor legacy syntax reports its stores', async () => {
  const c = await instrumented(`<script>
  import { writable } from 'svelte/store';
  const count = writable(4);
</script>
<p>{$count}</p>`);

  expect(c.values).toEqual({ $count: 4 });
});

// Any reporting code with $effect or $: would decide such a component's mode for it.
test('a component with neither runes nor legacy syntax gets no $effect and no $:', () => {
  const out =
    run(`<script>
  import { writable } from 'svelte/store';
  const count = writable(0);
</script>
<p>{$count}</p>`) ?? '';
  expect(out).not.toContain('$effect(');
  expect(out).not.toContain('$: ');
});

test('without runes or legacy syntax, a context read and one provided are reported', async () => {
  const c = await instrumented(
    `<script>
  import { getContext, setContext } from 'svelte';
  const greeting = getContext('greeting');
  setContext('reply', greeting);
</script>`,
    { context: new Map([['greeting', 'hi']]) },
  );

  expect(c.values).toEqual({ greeting: 'hi', provided: { reply: 'hi' } });
});

test('an instance of a reactive class imported from another file reaches the panel', async () => {
  const c = await instrumented(`<script>
  import { Box } from ${JSON.stringify(BOX)};
  const box = new Box();
</script>
<p>{box.value}</p>`);

  expect(c.kinds).toEqual({ box: 'class' });
  expect(c.writable).toEqual([]);
  expect(agent.inspectPath(c.node.id, ['box'])).toEqual({
    __runespect: 'instance',
    name: Box.name,
    fields: { value: 1, double: 2 },
  });
});
