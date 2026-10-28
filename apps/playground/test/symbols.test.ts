import { test, expect } from 'vitest';
import { parse } from 'svelte/compiler';
import { parseAst } from 'vite';
import { componentSymbols, moduleSymbols, mayReportModule } from '@runespect/vite-plugin/internal';

// What a file reports to the agent, and what the panel may write, read straight from the symbol
// list: no compile and no mount. The full-compile tests (preprocess-*, module-state) prove that what
// is reported reaches the agent and that every write compiles; these pin the rules.

const report = (symbols: { symbol: string; kind: string; write?: string }[]) => ({
  kinds: Object.fromEntries(symbols.map((s) => [s.symbol, s.kind])),
  writable: symbols.filter((s) => s.write).map((s) => s.symbol),
});
const component = (source: string) =>
  report(componentSymbols(parse(source, { modern: true })).symbols);
const script = (body: string, lang = '') =>
  component(`<script${lang && ` lang="${lang}"`}>\n${body}\n</script>`);
const moduleFile = (code: string) => report(moduleSymbols(parseAst(code)));

test('let state is writable; const state, a snapshot and deriveds are not', () => {
  expect(
    script(`let a = $state(1), b = $derived(a * 2);
const c = $state(0);
let raw = $state.raw({});
let big = $derived.by(() => a);
const copy = $state.snapshot({ a: 1 });
let [first, second] = $derived([a, b]);`),
  ).toEqual({
    kinds: {
      a: 'state',
      b: 'derived',
      c: 'state',
      raw: 'state',
      big: 'derived',
      first: 'derived',
      second: 'derived',
    },
    writable: ['a', 'raw'],
  });
});

test('state behind a TypeScript `!`, `as` or `satisfies` is seen', () => {
  expect(
    script(
      `let el = $state<HTMLElement>()!;
let n = $state(0) as number;
let cfg = $state({ a: 1 }) satisfies { a: number };`,
      'ts',
    ).kinds,
  ).toEqual({ el: 'state', n: 'state', cfg: 'state' });
});

test('a $bindable prop is writable unless const; other props and rest props are not', () => {
  expect(script(`let { value = $bindable(0), label = 'x', ...rest } = $props();`)).toEqual({
    kinds: { value: 'prop', label: 'prop' },
    writable: ['value'],
  });
  expect(script(`const { value = $bindable('') } = $props();`).writable).toEqual([]);
  expect(script(`let props = $props();`)).toEqual({ kinds: { props: 'prop' }, writable: [] });
});

test('the reactive fields of a local class are reported; $state fields are writable', () => {
  expect(
    script(`class Box {
  value = $state(1);
  double = $derived(this.value * 2);
  'a-b' = $state(0);
  #secret = $state(1);
  plain = 1;
}
let box = new Box();
let d = new Date();`),
  ).toEqual({ kinds: { 'box.value': 'class', 'box.double': 'class' }, writable: ['box.value'] });
});

test('a svelte/reactivity collection is read-only state, named or through a namespace', () => {
  expect(
    script(
      `import { SvelteSet, SvelteMap as Stock } from 'svelte/reactivity';
import * as R from 'svelte/reactivity';
import type { SvelteDate } from 'svelte/reactivity';
let tags = new SvelteSet();
const stock = new Stock();
const map = new R.SvelteMap();
const today = new SvelteDate();
let x = $state(1);`,
      'ts',
    ),
  ).toEqual({
    kinds: { tags: 'state', stock: 'state', map: 'state', x: 'state' },
    writable: ['x'],
  });
});

test('a class named like a reactive one but declared here is not a collection', () => {
  expect(script(`class SvelteSet extends Set {}\nconst tags = new SvelteSet();`).kinds).toEqual({});
});

test('a store read with $ is reported read-only; $-named keys and members are not stores', () => {
  const { symbols } = componentSymbols(
    parse(
      `<script>
import { writable } from 'svelte/store';
const count = writable(0);
const q = $state({ $in: [1] });
</script>
<p>{$count} {q.$in} {$undeclared}</p>`,
      { modern: true },
    ),
  );
  expect(symbols).toContainEqual({ symbol: '$count', kind: 'store', read: '$count' });
  expect(report(symbols)).toEqual({ kinds: { q: 'state', $count: 'store' }, writable: [] });
});

test('a context read is reported; setContext calls fold into one read-only `provided`', () => {
  const { symbols } = componentSymbols(
    parse(
      `<script>
import { getContext, setContext } from 'svelte';
let n = $state(0);
const theme = getContext('theme');
setContext('count', n);
setContext(KEY, 'dark');
setContext('made', make());
</script>`,
      { modern: true },
    ),
  );
  expect(symbols).toContainEqual({
    symbol: 'provided',
    kind: 'context-set',
    read: `({ "count": n, "KEY": 'dark' })`,
  });
  expect(report(symbols).writable).toEqual(['n']);
  expect(report(symbols).kinds).toMatchObject({ theme: 'context' });
});

test('legacy mode reports export let, top-level let and $: deriveds, all read-only', () => {
  expect(script(`export let label = 'a';\nlet count = 0;\n$: doubled = count * 2;`)).toEqual({
    kinds: { label: 'prop', count: 'state', doubled: 'derived' },
    writable: [],
  });
});

// Any reporting code would decide such a component's mode for it, so it reports only what can be
// read without it: contexts, and stores through their own subscription.
test('a component with neither runes nor legacy syntax reports contexts and watched stores', () => {
  const { symbols } = componentSymbols(
    parse(
      `<script>
import { writable } from 'svelte/store';
import { getContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
const tags = new SvelteSet();
const count = writable(0);
const greeting = getContext('greeting');
const x = 1;
</script>
<p>{$count}</p>`,
      { modern: true },
    ),
  );
  expect(symbols).toEqual([
    { symbol: 'greeting', kind: 'context', read: 'greeting' },
    { symbol: '$count', kind: 'store', store: 'count' },
  ]);
});

test('a component lists its snippets once each, with or without a script', () => {
  expect(
    componentSymbols(
      parse(
        `{#snippet a()}x{/snippet}<div>{#snippet a()}y{/snippet}{#snippet b()}{/snippet}</div>`,
        {
          modern: true,
        },
      ),
    ),
  ).toEqual({ symbols: [], snippets: ['a', 'b'] });
});

test('a module reports state, deriveds and class fields; exported state is read-only', () => {
  expect(
    moduleFile(`import { SvelteSet } from 'svelte/reactivity';
export let shared = $state(0);
let own = $state(0);
const fixed = $state(0);
export const total = $derived(own + 1);
let tags = new SvelteSet();
class Box { v = $state(1); d = $derived(this.v * 2); }
export const box = new Box();
export { own as alias };`),
  ).toEqual({
    kinds: {
      shared: 'state',
      own: 'state',
      fixed: 'state',
      tags: 'state',
      total: 'derived',
      'box.v': 'class',
      'box.d': 'class',
    },
    writable: ['box.v'],
  });
});

test('a private let in a module is writable', () => {
  expect(moduleFile(`let n = $state(0);\nexport const inc = () => n++;`).writable).toEqual(['n']);
});

// Runes are allowed only in .svelte, .svelte.js and .svelte.ts files, so a class imported from one
// may be reactive; its instance is reported as one value, which the panel expands to its fields.
test('an instance of a class imported from a .svelte file is reported, read-only', () => {
  expect(
    script(
      `import { Box } from './box.svelte';
import * as M from '$lib/models.svelte.ts';
import { Plain } from './plain.js';
import type { Typed } from './typed.svelte.js';
const box = new Box();
let model = new M.Model();
const plain = new Plain();
const typed = new Typed();`,
      'ts',
    ),
  ).toEqual({ kinds: { box: 'class', model: 'class' }, writable: [] });
});

test('an instance of an imported class is reported in a component without runes too', () => {
  expect(script(`import { Box } from './box.svelte.js';\nconst box = new Box();`).kinds).toEqual({
    box: 'class',
  });
});

test('a module reports an instance of a class it imports from a .svelte file', () => {
  const code = `import { Box } from './box.svelte.js';\nexport const box = new Box();`;
  expect(moduleFile(code)).toEqual({ kinds: { box: 'class' }, writable: [] });
  expect(mayReportModule(code)).toBe(true);
});

const MODULES = [
  `let n = $state(0);`,
  `export const d = $derived.by(() => 1);`,
  `import { SvelteMap } from 'svelte/reactivity';\nexport const m = new SvelteMap();`,
  `import * as R from 'svelte/reactivity';\nexport const s = new R.SvelteSet();`,
  `class C { v = $state(1) }\nexport const c = new C();`,
  `class C { d = $derived(1) }\nexport const c = new C();`,
  `export const plain = 1;`,
  `import { Box } from './box.svelte';\nexport const b = new Box();`,
  `import { Box } from './box.svelte.ts';\nexport const b = new Box();`,
];

// The prefilter skips parsing a module; it must never skip one that reports something.
test('a module that reports anything passes the prefilter', () => {
  for (const code of MODULES) {
    if (moduleSymbols(parseAst(code)).length) expect(mayReportModule(code), code).toBe(true);
  }
  expect(mayReportModule(`export const plain = 1;`)).toBe(false);
});

// A runes component may export state for its parent to read through bind:this. It is the
// component's state like any other; exported, it cannot be reassigned.
test("a component's exported state is reported, read-only", () => {
  expect(script(`export const api = $state({ n: 1 });\nlet n = $state(0);`)).toEqual({
    kinds: { api: 'state', n: 'state' },
    writable: ['n'],
  });
});

// Svelte refuses a module that reassigns state it exports, but not a component.
test("a component's exported let state stays writable", () => {
  expect(script(`let x = $state(0);\nexport { x };`).writable).toEqual(['x']);
});
