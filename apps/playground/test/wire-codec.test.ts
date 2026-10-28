import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { dehydrate } from '@runespect/agent/protocol/internal';
import {
  diffOps,
  indexById,
  commitFromOps,
  type SerializedNode,
} from '@runespect/agent/protocol/internal';
import { Detail, formatValue, entriesOf, isExpandable, valueType } from '@runespect/ui/internal';
import { openPanel } from './helpers/agent';

// The extension relay and the HMR channel carry JSON, not structured clone. Whatever dehydrate()
// produces must therefore come out of a JSON round trip meaning the same thing to the panel.
const overJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const wire = (v: unknown): unknown => overJson(dehydrate(v, 1));

test.each([
  ['Map', new Map([['a', 1]]), 'map', 'Map(1)'],
  ['Set', new Set([1, 2]), 'set', 'Set(2)'],
  ['Date', new Date('2020-01-02T03:04:05.000Z'), 'date', '2020-01-02T03:04:05.000Z'],
  ['invalid Date', new Date('nope'), 'date', 'Invalid Date'],
  ['BigInt', 10n, 'bigint', '10n'],
  ['undefined', undefined, 'undefined', 'undefined'],
  ['NaN', NaN, 'number', 'NaN'],
  ['Infinity', Infinity, 'number', 'Infinity'],
  ['-Infinity', -Infinity, 'number', '-Infinity'],
  ['RegExp', /x+/gi, 'regexp', '/x+/gi'],
  ['Error', new TypeError('boom'), 'error', 'TypeError: boom'],
  ['typed array', new Uint8Array(16), 'typedarray', 'Uint8Array(16)'],
  ['ArrayBuffer', new ArrayBuffer(1024), 'arraybuffer', 'ArrayBuffer(1024)'],
])('a %s survives the JSON wire and reads the same in the panel', (_, value, type, text) => {
  const received = wire(value);
  expect(valueType(received)).toBe(type);
  expect(formatValue(received)).toBe(text);
});

test('Map and Set entries survive the JSON wire', () => {
  expect(
    entriesOf(
      wire(
        new Map<unknown, unknown>([
          ['a', 1],
          [2, 'b'],
        ]),
      ),
    ),
  ).toEqual([
    ['a', 1],
    ['2', 'b'],
  ]);
  expect(entriesOf(wire(new Set(['x', 'y'])))).toEqual([
    ['0', 'x'],
    ['1', 'y'],
  ]);
});

test('a key whose value is undefined is kept, not dropped by JSON', () => {
  const received = wire({ u: undefined, n: 1 }) as Record<string, unknown>;
  expect(Object.keys(received)).toEqual(['u', 'n']);
  expect(formatValue(received.u)).toBe('undefined');
});

test('an Error, a typed array and an ArrayBuffer cannot be expanded', () => {
  expect(isExpandable(wire(new Error('boom')))).toBe(false);
  expect(isExpandable(wire(new Uint8Array(16)))).toBe(false);
  expect(isExpandable(wire(new ArrayBuffer(8)))).toBe(false);
});

test('a Map keyed by a DOM element or a class instance can still be sent', () => {
  class Service {
    run(): void {}
  }
  const value = new Map<unknown, number>([
    [document.body, 1],
    [new Service(), 2],
  ]);
  expect(() => structuredClone(dehydrate(value, 1))).not.toThrow();
  expect(entriesOf(wire(value))).toHaveLength(2);
});

const node = (values: Record<string, unknown>): SerializedNode => ({
  id: 1,
  name: 'C',
  parent: null,
  children: [],
  snippets: [],
  values,
  writable: Object.keys(values),
});
const wireNode = (values: Record<string, unknown>): SerializedNode =>
  node(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, wire(v)])));

test('a change inside a Map is a change', () => {
  const before = wireNode({ m: new Map([['a', 1]]) });
  const after = wireNode({ m: new Map([['a', 2]]) });
  const ops = diffOps(indexById([before]), [after]);
  expect(ops).toEqual([{ op: 'update', node: after }]);
  expect(commitFromOps(indexById([before]), ops, 1, 0).changes).toHaveLength(1);
});

test('a member added to a Set is a change', () => {
  const before = wireNode({ s: new Set([1]) });
  const after = wireNode({ s: new Set([1, 2]) });
  expect(diffOps(indexById([before]), [after])).toHaveLength(1);
});

let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
});

test('a BigInt in state is sent on every update', () => {
  const sent: any[] = [];
  stop = agent.connect(openPanel({ send: (m: any) => sent.push(m) }));
  const id = agent.enter('Big');
  agent.report(id, 'n', 1n);
  flushSync();
  agent.report(id, 'n', 2n);
  flushSync();

  const last = sent.filter((m) => m.kind === 'ops').at(-1);
  expect(formatValue(overJson(last.ops[0].node.values.n))).toBe('2n');
  expect(agent.commits().at(-1)?.changes).toMatchObject([{ symbol: 'n' }]);
});

test('a value the panel shows through a tag cannot be edited', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Detail, {
    target,
    props: {
      node: {
        ...wireNode({ created: new Date(0), big: 1n, config: { at: new Date(0), size: 1 } }),
        kinds: { created: 'state', big: 'state', config: 'state' },
      },
    },
  });
  flushSync();

  expect(target.querySelector('[data-detail-edit="C.created"]')).toBeNull();
  expect(target.querySelector('[data-detail-edit="C.big"]')).toBeNull();

  const config = target.querySelector('[data-detail-edit="C.config"]') as HTMLElement;
  (config.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  const leaves = [...config.querySelectorAll<HTMLInputElement>('input[data-edit-leaf]')];
  expect(leaves.map((i) => i.value)).toEqual(['1']);
});
