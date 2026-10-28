import { test, expect } from 'vitest';
import path from 'node:path';
import { runespectPreprocess } from '@runespect/vite-plugin';
import * as agent from '@runespect/agent/internal';
import { instrumented } from './helpers/instrumented';

const pp = runespectPreprocess({ enabled: true });

test('$derived.by is reported, read-only', async () => {
  const c = await instrumented(`<script>
  let count = $state(1);
  let big = $derived.by(() => count * 100);
</script>`);

  expect(c.values).toEqual({ count: 1, big: 100 });
  expect(c.writable).toEqual(['count']);
});

test('$state.raw is reported, and can be edited', async () => {
  const c = await instrumented(`<script>
  let data = $state.raw({ a: 1 });
</script>`);

  expect(c.set('data', { a: 2 })).toBe(true);
  expect(c.values).toEqual({ data: { a: 2 } });
});

test('a $bindable prop can be edited; a plain prop with a default is read-only', async () => {
  const c = await instrumented(`<script>
  let { value = $bindable(0), label = "x" } = $props();
</script>
<p>{value}</p>`);

  expect(c.values).toEqual({ value: 0, label: 'x' });
  expect(c.writable).toEqual(['value']);
  expect(c.set('value', 5)).toBe(true);
  expect(document.body.textContent).toContain('5');
});

// A setter for a const is a compile error (constant_assignment) in the user's component.
test('a const-destructured $bindable prop is reported but read-only', async () => {
  const c = await instrumented(`<script>
  const { value = $bindable('') } = $props();
</script>`);

  expect(c.readable).toEqual(['value']);
  expect(c.writable).toEqual([]);
});

test('every declarator in one statement is reported', async () => {
  const c = await instrumented(`<script>
  let a = $state(1), b = $derived(a * 2);
</script>`);

  expect(c.values).toEqual({ a: 1, b: 2 });
  expect(c.writable).toEqual(['a']);
});

test('rest props are left out, and the named props still reported', async () => {
  const c = await instrumented(
    `<script>
  let { a, ...rest } = $props();
</script>`,
    { props: { a: 1, b: 2 } },
  );

  expect(c.readable).toEqual(['a']);
});

test("the component's source file is where open-in-editor goes", async () => {
  const c = await instrumented(`<script>let n = $state(0);</script>`, {
    filename: 'Counter.svelte',
  });

  expect(path.isAbsolute(c.node.loc!)).toBe(true);
  expect(path.basename(c.node.loc!)).toBe('Counter.svelte');
});

test('declared {#snippet} blocks are listed on the node', async () => {
  const c = await instrumented(`<script>
  let { items = [] } = $props();
</script>
{#snippet row(item)}<li>{item}</li>{/snippet}`);

  expect(c.node.snippets).toEqual(['row']);
});

// Two children can each be handed their own inline snippet of the same name. Listed twice, the
// name would become a duplicate key in the panel and take the whole panel down.
test('a snippet name declared twice is listed once', async () => {
  const c = await instrumented(`<script>let n = $state(0);</script>
<div>{#snippet header()}Mouse{/snippet}</div>
<div>{#snippet header()}Keyboard{/snippet}</div>`);

  expect(c.node.snippets).toEqual(['header']);
});

test('a component whose only reactive surface is snippets still joins the tree', async () => {
  const c = await instrumented(`<script>
  const x = 1;
</script>
{#snippet foo()}<p>x</p>{/snippet}`);

  expect(c.node.snippets).toEqual(['foo']);
});

test('a component with no <script> joins the tree, and leaves it', async () => {
  const c = await instrumented(`<div>static</div>`, { filename: 'C.svelte' });

  expect(c.node.name).toBe('C');
  c.unmount();
  expect(agent.allNodes()).toEqual([]);
});

test('returns a v3 sourcemap so original line numbers survive the insertions', () => {
  const out = pp.markup({
    content: `<script>\n  let c = $state(0);\n</script>`,
    filename: 'C.svelte',
  })!;
  const map = out.map as { version: number; mappings: string; sources: string[] };
  expect(map).toBeTruthy();
  expect(map.version).toBe(3);
  expect(map.mappings.length).toBeGreaterThan(0);
  expect(map.sources).toContain('C.svelte');
});

test("a component's exported state reaches the panel", async () => {
  const c = await instrumented(`<script>
  export const api = $state({ n: 1 });
</script>`);

  expect(c.values).toEqual({ api: { n: 1 } });
  expect(c.writable).toEqual([]);
});
