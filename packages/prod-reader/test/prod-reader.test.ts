import { test, expect, beforeAll } from 'vitest';
import { parse } from 'acorn';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import {
  readProdNodeChunk,
  resolveHookTargets,
  generateChunkWrapper,
  wrapRuntime,
  staticTreeForChunk,
  assembleSerialized,
  bootModuleProd,
  hasDevSeam,
  rewriteProdChunkImport,
  componentNamesFromSourcemap,
  type RecordedSignal,
} from '../src/index.js';
import { runeFieldNames } from '../src/sourcemap.js';

const here = dirname(fileURLToPath(import.meta.url));
const nodesDir = join(here, 'fixtures/nodes');
const chunksDir = join(here, 'fixtures/chunks');
const biggest = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f, size: statSync(join(dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0].f;

const nodeFile = biggest(nodesDir);
const nodeCode = readFileSync(join(nodesDir, nodeFile), 'utf8');
const runtimeChunkPath = join(chunksDir, biggest(chunksDir));
const sourcemap = JSON.parse(readFileSync(join(nodesDir, nodeFile + '.map'), 'utf8'));

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)) as never;
  }
});

test('static: rebuilds the tree + signal shape from a minified prod chunk', () => {
  const { tree } = readProdNodeChunk(nodeCode);
  expect(tree).not.toBeNull();
  expect(tree!.children).toHaveLength(3);
  const counters = tree!.children.filter((c) => c.signals.state === 1 && c.signals.derived === 1);
  expect(counters.map((c) => c.props.start).sort()).toEqual([1, 10]);
});

test('resolveHookTargets maps roles to distinct mangled runtime exports', () => {
  const { chunkRef, exports } = resolveHookTargets(nodeCode);
  expect(chunkRef).toMatch(/chunks\//);
  const names = [exports.state, exports.derived, exports.get, exports.set];
  expect(names.every(Boolean)).toBe(true);
  expect(new Set(names).size).toBe(names.length);
});

test('generateChunkWrapper re-exports the chunk, overrides state/derived, registers the sub-tree', () => {
  const { exports } = resolveHookTargets(nodeCode);
  const treeJSON = JSON.stringify(staticTreeForChunk(nodeCode));
  const src = generateChunkWrapper('/chunks/RUNTIME.js', exports, treeJSON);
  expect(src).toContain('export * from "/chunks/RUNTIME.js"');
  expect(src).toMatch(new RegExp(`export \\{ \\w+ as ${exports.state} \\}`));
  expect(src).toContain('__RS_PROD_TREES__');
});

// The runtime chunk's exports are mangled to one or two letters, so they can be any name the wrapper
// itself uses. A clash is a SyntaxError, and the page's route module then fails to load.
test.each([
  { state: 'g', derived: 'w', get: 'a', set: 'b' },
  { state: 'real', derived: 'sink', get: 'wrap', set: 'exports' },
])('generateChunkWrapper parses whatever the runtime exports are called (%o)', (exports) => {
  const src = generateChunkWrapper('/chunks/RUNTIME.js', exports, '{}');
  expect(() => parse(src, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow();
});

test('end-to-end against the REAL runtime: static tree + live values → SerializedNode[]', async () => {
  const { exports } = resolveHookTargets(nodeCode);
  const tree = staticTreeForChunk(nodeCode)!;
  const real: any = await import(pathToFileURL(runtimeChunkPath).href);

  const sink: RecordedSignal[] = [];
  const w = wrapRuntime(real, exports, sink);

  // replay the app's signal creations in render order using the REAL minified runtime
  w.state('SvelteKit'); // +page name
  const c1 = w.state(1); // Counter 1
  w.derived(() => (w.get(c1) as number) * 2);
  const c2 = w.state(10); // Counter 2
  w.derived(() => (w.get(c2) as number) * 2);

  const nodes = assembleSerialized([{ tree, sink }]);
  const counters = nodes.filter((n) => n.writable.includes('state') && 'derived' in n.values);
  expect(counters).toHaveLength(2);
  expect(counters.map((n) => n.values.state).sort((a, b) => (a as number) - (b as number))).toEqual(
    [1, 10],
  );
  expect(
    counters.map((n) => n.values.derived).sort((a, b) => (a as number) - (b as number)),
  ).toEqual([2, 20]);

  // LIVE: mutate through the real runtime, re-assemble, value tracks (derived recomputes)
  w.set(c1, 7);
  const live2 = assembleSerialized([{ tree, sink }]);
  const updated = live2.find((n) => n.values.state === 7);
  expect(updated?.values.derived).toBe(14);
});

test('sourcemap recovers real component names from the source files', () => {
  const names = componentNamesFromSourcemap(nodeCode, sourcemap);
  // every component function maps to its .svelte source basename
  expect(new Set(names.values())).toEqual(new Set(['Counter', 'Greeting', '+page (/)']));
});

test('staticTreeForChunk labels components with real names when given a sourcemap', () => {
  const anon = staticTreeForChunk(nodeCode)!;
  expect(anon.label).toMatch(/^<[a-z]>$/i); // minified, e.g. <C>

  const named = staticTreeForChunk(nodeCode, sourcemap)!;
  expect(named.label).toBe('<+page (/)>');
  const labels = named.children.map((c) => c.label).sort();
  expect(labels).toEqual(['<Counter>', '<Counter>', '<Greeting>']);
});

test('sourcemap recovers $state/$derived FIELD names from sourcesContent', () => {
  const named = staticTreeForChunk(nodeCode, sourcemap)!;
  const counter = named.children.find((c) => c.label === '<Counter>')!;
  expect(counter.stateNames).toEqual(['count']);
  expect(counter.derivedNames).toEqual(['doubled']);
  expect(named.stateNames).toEqual(['name']); // +page

  // and assembleSerialized labels the live values with those names
  const { exports } = resolveHookTargets(nodeCode);
  const sink = [
    { kind: 'state' as const, read: () => 'SvelteKit' },
    { kind: 'state' as const, read: () => 5 },
    { kind: 'derived' as const, read: () => 10 },
  ];
  void exports;
  const nodes = assembleSerialized([{ tree: counter, sink: sink.slice(1) }]);
  expect(nodes[0].values).toMatchObject({ count: 5, doubled: 10 });
  expect(nodes[0].writable).toContain('count');
});

test('rewriteProdChunkImport embeds real names in the wrapper when given a sourcemap', () => {
  const origin = 'http://localhost:4174/_app/immutable/nodes/';
  const out = rewriteProdChunkImport(nodeCode, (ref) => new URL(ref, origin).href, sourcemap)!;
  const dataUrl = out.rewritten.match(/data:text\/javascript;charset=utf-8,([^"']+)/)![1];
  const wrapper = decodeURIComponent(dataUrl);
  expect(wrapper).toContain('<Counter>');
  expect(wrapper).toContain('<+page (/)>');
});

test('hasDevSeam distinguishes dev component modules from prod chunks', () => {
  expect(hasDevSeam('import * as $ from "svelte/internal/client";')).toBe(true);
  expect(hasDevSeam('import * as $ from "/deps/svelte_internal_client.js";')).toBe(true);
  expect(hasDevSeam(nodeCode)).toBe(false); // a real prod chunk
});

test('rewriteProdChunkImport redirects the runtime import to a recording wrapper', () => {
  const origin = 'http://localhost:4173/_app/immutable/nodes/';
  const out = rewriteProdChunkImport(nodeCode, (ref) => new URL(ref, origin).href);
  expect(out).not.toBeNull();
  expect(out!.runtimeRef).toMatch(/chunks\//);
  expect(out!.rewritten).toContain('data:text/javascript');
  // the original runtime import specifier is gone (redirected)
  expect(out!.rewritten).not.toContain(`"${out!.runtimeRef}"`);

  // the wrapper statically re-imports the real runtime chunk at its ABSOLUTE url
  const dataUrl = out!.rewritten.match(/data:text\/javascript;charset=utf-8,([^"']+)/)![1];
  const wrapper = decodeURIComponent(dataUrl);
  expect(wrapper).toContain('export * from "http://localhost:4173/_app/immutable/chunks/');
  expect(wrapper).toContain('__RS_PROD_TREES__');
});

test('rewriteProdChunkImport returns null for dev modules and non-component scripts', () => {
  expect(
    rewriteProdChunkImport('import * as $ from "svelte/internal/client";', (r) => r),
  ).toBeNull();
  expect(rewriteProdChunkImport('export const x = 1;', (r) => r)).toBeNull();
});

test('bootModuleProd: reconstruct assembles prod trees, else delegates to the dev reconstruct', () => {
  const g = globalThis as any;
  // dev path still works when no prod trees are registered
  g.__runespectReconstruct = () => [
    { id: 1, name: 'DevNode', parent: null, children: [], values: {}, snippets: [], writable: [] },
  ];
  delete g.__RS_PROD_TREES__;

  (0, eval)(bootModuleProd());
  expect(g.__runespectReconstruct()[0].name).toBe('DevNode');

  // with prod trees registered, it assembles them
  g.__RS_PROD_TREES__ = [
    {
      tree: { label: '<y>', props: { start: 1 }, state: 1, derived: 1, children: [] },
      sink: [
        { kind: 'state', read: () => 1 },
        { kind: 'derived', read: () => 2 },
      ],
    },
  ];
  const out = g.__runespectReconstruct();
  expect(out[0].name).toBe('<y>');
  expect(out[0].values).toMatchObject({ state: 1, derived: 2, 'prop:start': 1 });
  delete g.__RS_PROD_TREES__;
  delete g.__runespectReconstruct;
});

// Field names come from the source, values from the compiled output, matched by position. Svelte
// does not make a signal for every $state, so a name is only given where the match is certain:
// a wrong name on a value is worse than no name.
test('a $state that is never reassigned has no signal, so it takes no name', () => {
  const fields = runeFieldNames(
    'let a = $state(0); let items = $state([1, 2]); let b = $state(1); let c = $state(0);\n' +
      'function inc() { b = 2; c++; }',
  );
  expect(fields).toEqual({ state: ['b', 'c'], derived: [] });
});

test('a bind: or a compound assignment counts as reassigning', () => {
  const fields = runeFieldNames(
    '<script>let v = $state(""); let n = $state(0); n += 1;</script><input bind:value={v} />',
  );
  expect(fields?.state).toEqual(['v', 'n']);
});

test.each([
  ['a class with $state fields', 'class C { n = $state(0) } let a = $state(0); a = 1;'],
  ['a destructured $derived', 'let { x, y } = $derived(point); let a = $state(0); a = 1;'],
])('names are left out for %s, whose signals the source cannot place', (_, source) => {
  expect(runeFieldNames(source)).toBeNull();
});

test('names are left out when there are more of them than recorded signals', () => {
  const extra = structuredClone(sourcemap);
  extra.sourcesContent = extra.sourcesContent.map((content: string | null) =>
    content?.includes('$derived') && content.includes('count')
      ? content.replace('<script', '<script>let extra = $state(0); extra = 1;</script><script')
      : content,
  );
  const counter = staticTreeForChunk(nodeCode, extra)!.children.find(
    (c) => c.label === '<Counter>',
  )!;
  expect(counter.stateNames).toBeUndefined();
  expect(counter.derivedNames).toEqual(['doubled']);
});

// A prod chunk's recorded signals only grow: a component that is unmounted and mounted again adds a
// new set behind the old one. The tree must show the instance that is on the page now.
test('assembleSerialized reads the newest mount of a component, not the first', () => {
  const tree = { label: '<Counter>', props: {}, state: 1, derived: 1, children: [] };
  const sink: RecordedSignal[] = [
    { kind: 'state', read: () => 1 },
    { kind: 'derived', read: () => 2 },
    { kind: 'state', read: () => 7 },
    { kind: 'derived', read: () => 14 },
  ];
  const [node] = assembleSerialized([{ tree, sink }]);
  expect(Object.values(node.values)).toEqual([7, 14]);
});

test('wrapRuntime leaves a runtime it does not recognise untouched, and keeps the reason', () => {
  const g = globalThis as any;
  const real = { s: (v: unknown) => v, d: (f: unknown) => f, x: 1 } as any;
  const wrapped = wrapRuntime(real, { state: 's', derived: 'd', get: 'x', set: 'y' }, []);
  expect(wrapped.state).toBe(real.s);
  expect(g.__RS_CAPTURE__.problem).toMatch(/x/);
  delete g.__RS_CAPTURE__;
});
