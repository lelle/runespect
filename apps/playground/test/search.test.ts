import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import {
  Tree,
  matchingNodeIds,
  visibleNodeIds,
  excludeNodes,
  compileMatcher,
  searchMatches,
} from '@runespect/ui/internal';

const n = (
  id: number,
  name: string,
  parent: number | null,
  children: number[] = [],
  values: Record<string, unknown> = {},
) => ({
  id,
  name,
  parent,
  children,
  values,
  snippets: [],
  writable: [],
});

const nodes = [n(1, 'App', null, [2, 3]), n(2, 'Counter', 1), n(3, 'List', 1, [4]), n(4, 'Row', 3)];

// nodes where only Counter and Row carry values (the rest are structural)
const mixed = [
  n(1, 'App', null, [2, 3]),
  n(2, 'Counter', 1, [], { count: 0 }),
  n(3, 'Wrapper', 1, [4]),
  n(4, 'Row', 3, [], { i: 1 }),
];

// App(1) ▸ Provider(2) ▸ Counter(3) ; App(1) ▸ Footer(4)
const wrapped = [
  n(1, 'App', null, [2, 4]),
  n(2, 'Provider', 1, [3]),
  n(3, 'Counter', 2),
  n(4, 'Footer', 1),
];

test('excludeNodes: a hidden wrapper is removed and its children re-parent to the nearest kept ancestor', () => {
  const out = excludeNodes(wrapped, (node) => node.name === 'Provider');
  expect(out.map((node) => node.name).sort()).toEqual(['App', 'Counter', 'Footer']); // Provider gone
  const counter = out.find((node) => node.name === 'Counter')!;
  expect(counter.parent).toBe(1); // re-parented from Provider(2) up to App(1)
  const app = out.find((node) => node.name === 'App')!;
  expect(app.children).toEqual([3, 4]); // Counter promoted, in order, alongside Footer
});

test('excludeNodes: excluding a root promotes its children to roots', () => {
  const out = excludeNodes(
    [n(1, 'Root', null, [2]), n(2, 'Child', 1)],
    (node) => node.name === 'Root',
  );
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ name: 'Child', parent: null });
});

test('excludeNodes: nested exclusions collapse through to the nearest visible ancestor', () => {
  const chain = [n(1, 'App', null, [2]), n(2, 'A', 1, [3]), n(3, 'B', 2, [4]), n(4, 'Leaf', 3)];
  const out = excludeNodes(chain, (node) => node.name === 'A' || node.name === 'B');
  expect(out.map((node) => node.name).sort()).toEqual(['App', 'Leaf']);
  expect(out.find((node) => node.name === 'Leaf')!.parent).toBe(1); // collapsed A→B→ up to App
});

test('visibleNodeIds: no filters → null (show all)', () => {
  expect(visibleNodeIds(mixed, {})).toBeNull();
  expect(visibleNodeIds(mixed, { query: '', onlyStateful: false })).toBeNull();
});

test('visibleNodeIds: onlyStateful keeps stateful nodes + their ancestors', () => {
  // Counter(2) + Row(4) are stateful; ancestors App(1), Wrapper(3) kept for the path.
  expect(visibleNodeIds(mixed, { onlyStateful: true })).toEqual(new Set([2, 1, 4, 3]));
});

test('visibleNodeIds: a stateless leaf with no stateful descendants is hidden', () => {
  const onlyApp = [n(1, 'App', null, [2]), n(2, 'Static', 1)];
  expect(visibleNodeIds(onlyApp, { onlyStateful: true })).toEqual(new Set()); // nothing stateful
});

test('visibleNodeIds: query and onlyStateful combine (both must hold for a match)', () => {
  // "row" matches by name AND is stateful → Row + ancestors; Counter excluded by name
  expect(visibleNodeIds(mixed, { query: 'row', onlyStateful: true })).toEqual(new Set([4, 3, 1]));
  // "wrapper" matches by name but is not stateful → no direct match
  expect(visibleNodeIds(mixed, { query: 'wrapper', onlyStateful: true })).toEqual(new Set());
});

// Which ids match a query (matches + ancestors).
test('compileMatcher: case-insensitive substring; empty → null', () => {
  expect(compileMatcher('')).toBeNull();
  expect(compileMatcher('   ')).toBeNull();
  const m = compileMatcher('co');
  expect(m?.error).toBe(false);
  expect(m?.test('Counter')).toBe(true);
  expect(m?.test('App')).toBe(false);
});

test('compileMatcher: /regex/ syntax with flags', () => {
  const anchored = compileMatcher('/^Cou/');
  expect(anchored?.test('Counter')).toBe(true);
  expect(anchored?.test('Account')).toBe(false); // anchored, so no substring match
  const ci = compileMatcher('/counter/i');
  expect(ci?.test('COUNTER')).toBe(true); // case-insensitive flag honored
});

test('compileMatcher: invalid regex → error and matches nothing', () => {
  const m = compileMatcher('/(/');
  expect(m?.error).toBe(true);
  expect(m?.test('anything')).toBe(false);
});

test('searchMatches: direct matches in node order (substring + regex)', () => {
  // 'o' appears in Counter and Row, in node order [2, 4] (not the ancestors App/List)
  expect(searchMatches(nodes, 'o')).toEqual({ ids: [2, 4], error: false });
  expect(searchMatches(nodes, '/^A/')).toEqual({ ids: [1], error: false }); // App only
  expect(searchMatches(nodes, '')).toEqual({ ids: [], error: false });
  expect(searchMatches(nodes, '/(/').error).toBe(true);
});

test('matchingNodeIds: /regex/ filters the tree (match + ancestors)', () => {
  expect(matchingNodeIds(nodes, '/^Row$/')).toEqual(new Set([4, 3, 1])); // Row + List + App
});

test('matchingNodeIds: empty query means no filter', () => {
  expect(matchingNodeIds(nodes, '')).toBeNull();
  expect(matchingNodeIds(nodes, '   ')).toBeNull();
});

test('matchingNodeIds: a match includes its ancestor chain', () => {
  // "Row" matches → Row + List + App visible; Counter not.
  expect(matchingNodeIds(nodes, 'row')).toEqual(new Set([4, 3, 1]));
});

test('matchingNodeIds: case-insensitive, multiple matches', () => {
  expect(matchingNodeIds(nodes, 'c')).toEqual(new Set([2, 1])); // Counter + App
});

test('matchingNodeIds: no match → empty set', () => {
  expect(matchingNodeIds(nodes, 'zzz')).toEqual(new Set());
});

// <Tree> shows only matching nodes + ancestors when filtered.
test('Tree: filter hides non-matching branches but keeps the path', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes, filter: 'row' } });
  flushSync();

  expect(target.querySelector('[data-component="Row"]')).toBeTruthy();
  expect(target.querySelector('[data-component="List"]')).toBeTruthy(); // ancestor kept
  expect(target.querySelector('[data-component="App"]')).toBeTruthy(); // ancestor kept
  expect(target.querySelector('[data-component="Counter"]')).toBeNull(); // filtered out
});

test('Tree: empty filter shows everything', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes, filter: '' } });
  flushSync();
  expect(target.querySelectorAll('[data-component]')).toHaveLength(4);
});

test('Tree: exclude hides matching nodes but keeps their children (re-parented)', () => {
  const tree = [
    n(1, 'App', null, [2, 4]),
    n(2, 'Provider', 1, [3]),
    n(3, 'Counter', 2),
    n(4, 'Footer', 1),
  ];
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes: tree, exclude: 'Provider' } });
  flushSync();
  expect(target.querySelector('[data-component="Provider"]')).toBeNull(); // hidden
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // child kept
  // Counter is now rendered under App (Provider's slot collapsed)
  expect(target.querySelector('[data-component="App"] [data-component="Counter"]')).toBeTruthy();
});

test('Tree: onlyStateful hides stateless leaves but keeps stateful nodes + ancestors', () => {
  const tree = [n(1, 'App', null, [2, 3]), n(2, 'Counter', 1, [], { count: 0 }), n(3, 'Static', 1)];
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes: tree, onlyStateful: true } });
  flushSync();
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy(); // stateful
  expect(target.querySelector('[data-component="App"]')).toBeTruthy(); // ancestor of Counter
  expect(target.querySelector('[data-component="Static"]')).toBeNull(); // stateless leaf hidden
});
