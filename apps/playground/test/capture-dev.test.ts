import { test, expect, beforeEach, afterEach } from 'vitest';
import * as real from 'svelte/internal/client';
import { mount, unmount, flushSync } from 'svelte';
import { compile } from 'svelte/compiler';
import { recordingRuntime, bootModule } from '../../../packages/proxy/src/served';
import { svelteAtLeast } from './svelte-version';

// Dev capture swaps a component's svelte/internal/client import for a recording wrapper. These
// tests compile real components and run them through that wrapper, so they break when Svelte's
// compiled output stops looking the way the recording expects.
// The recording rides Svelte's private internals; their current shape arrived in 5.34.0.
const recordedTest = test.skipIf(!svelteAtLeast('5.34.0'));
const g = globalThis as any;
let runtime: Record<string, unknown>;

beforeEach(() => {
  delete g.__RS_COLLECTOR__;
  runtime = { ...real, ...recordingRuntime(real, g) };
  (0, eval)(bootModule());
});
afterEach(() => {
  delete g.__RS_COLLECTOR__;
  delete g.__runespectReconstruct;
});

// Compiles `source` as src/<name>.svelte and evaluates it against the recording runtime. Components
// it renders are passed in by name, in place of their imports.
function component(name: string, source: string, children: Record<string, unknown> = {}): any {
  const { js } = compile(source, { filename: `src/${name}.svelte`, generate: 'client', dev: true });
  const body =
    js.code
      .replace(/^import .*;$/gm, '')
      .replace(/^export default function /m, 'function ')
      .replace(/^export .*$/gm, '') + `\nreturn ${name};`;
  return new Function('$', ...Object.keys(children), body)(runtime, ...Object.values(children));
}

function render(Component: unknown): { target: HTMLElement; app: Record<string, any> } {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(Component as never, { target });
  flushSync();
  return { target, app };
}

const tree = (): any[] => g.__runespectReconstruct();

const Counter = `<script>
  let count = $state(1);
  let doubled = $derived(count * 2);
</script>
<button onclick={() => count++}>{count} / {doubled}</button>`;

recordedTest('a mounted component is recorded with its state and deriveds', () => {
  render(component('Counter', Counter));
  const [node] = tree();
  expect(node.name).toBe('Counter');
  expect(node.values).toEqual({ count: 1, doubled: 2 });
});

recordedTest('a child component is recorded under its parent', () => {
  const Child = component('Counter', Counter);
  const Parent = component(
    'Parent',
    `<script>import Counter from './Counter.svelte';</script><Counter /><Counter />`,
    {
      Counter: Child,
    },
  );
  render(Parent);
  const nodes = tree();
  const parent = nodes.find((n) => n.name === 'Parent');
  expect(nodes.filter((n) => n.parent === parent.id).map((n) => n.name)).toEqual([
    'Counter',
    'Counter',
  ]);
});

// A $state object or array that is only mutated compiles to a proxy, not a signal: the most common
// way to hold a list or a form.
recordedTest('a $state that is only mutated is recorded, and follows its mutations', () => {
  const { target } = render(
    component(
      'Todos',
      `<script>
        let items = $state(['a']);
        let form = $state({ text: '' });
      </script>
      <button onclick={() => items.push(form.text || 'b')}>{items.length}</button>`,
    ),
  );
  expect(tree()[0].values).toEqual({ items: ['a'], form: { text: '' } });

  target.querySelector('button')!.click();
  flushSync();
  expect(tree()[0].values.items).toEqual(['a', 'b']);
  expect(tree()[0].writable).toEqual([]); // the proxy is never reassigned, so no setter exists
});

// Every navigation, {#if} and {#each} change unmounts components. They must leave the tree, or it
// fills with components that no longer exist, frozen at their last values.
recordedTest('an unmounted component leaves the tree, and a remounted one starts afresh', () => {
  const Child = component('Counter', Counter);
  const Toggle = component(
    'Toggle',
    `<script>import Counter from './Counter.svelte'; let show = $state(true);</script>
    <input type="checkbox" bind:checked={show} />{#if show}<Counter />{/if}`,
    { Counter: Child },
  );
  const { target } = render(Toggle);
  const checkbox = target.querySelector('input')!;
  const counters = () => tree().filter((n) => n.name === 'Counter');

  target.querySelector('button')!.click();
  flushSync();
  expect(counters().map((n) => n.values.count)).toEqual([2]);

  checkbox.click();
  flushSync();
  expect(counters()).toEqual([]);

  checkbox.click();
  flushSync();
  expect(counters().map((n) => n.values.count)).toEqual([1]);
});

recordedTest('unmounting the app empties the tree', () => {
  const { app } = render(component('Counter', Counter));
  unmount(app);
  expect(tree()).toEqual([]);
});

// A component that throws while it initialises never reaches its pop(), so its frame would stay on
// the stack and every component mounted after it would be filed under it.
recordedTest('a component that throws in a boundary does not adopt the components after it', () => {
  const Bad = component('Bad', `<script>throw new Error('not ready');</script>`);
  const Child = component('Counter', Counter);
  const Page = component(
    'Page',
    `<script>import Bad from './Bad.svelte'; import Counter from './Counter.svelte';</script>
    <svelte:boundary>{#snippet failed()}failed{/snippet}<Bad /></svelte:boundary><Counter />`,
    { Bad, Counter: Child },
  );
  render(Page);
  const nodes = tree();
  const page = nodes.find((n) => n.name === 'Page');
  const counter = nodes.find((n) => n.name === 'Counter');
  expect(counter.parent).toBe(page.id);
  expect(nodes.some((n) => n.name === 'Bad')).toBe(false);
});

recordedTest('a mount that throws outside a boundary does not adopt the next mount', async () => {
  const Bad = component('Bad', `<script>throw new Error('not ready');</script>`);
  expect(() => render(Bad)).toThrow('not ready');
  await Promise.resolve();
  render(component('Counter', Counter));
  expect(tree().map((n) => [n.name, n.parent])).toEqual([['Counter', null]]);
});

// The recording relies on Svelte's private runtime. When a release changes what it relies on, the
// capture must stop and say why, not break the page or show wrong data.
test('a runtime without what the recording needs is left untouched, and the reason is kept', () => {
  const { render_effect: _, ...changed } = real as Record<string, unknown>;
  const recording = recordingRuntime(changed, g);
  expect(recording.push).toBe(changed.push);
  expect(recording.state).toBe(changed.state);
  expect(g.__RS_CAPTURE__.problem).toMatch(/render_effect/);
  delete g.__RS_CAPTURE__;
});
