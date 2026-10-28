import { test, expect } from 'vitest';
import { childStep, dehydrate, readLive, writeEncoded } from '@runespect/agent/protocol/internal';

// A path is walked three times: the panel builds it from what it shows, the page reads the live value
// at it, and the panel splices the reply into its encoded copy. Each row checks that the three agree
// on the same entry, for keys that cannot address one (objects, keys that stringify alike).

const k1 = { id: 1 };
const k2 = { id: 1 };

const rows: {
  name: string;
  live: () => unknown;
  steps: (string | number)[];
  leaf: unknown;
  replaced: () => unknown;
}[] = [
  {
    name: 'a nested object key',
    live: () => ({ a: { b: 1 }, c: 2 }),
    steps: ['a', 'b'],
    leaf: 1,
    replaced: () => ({ a: { b: 'X' }, c: 2 }),
  },
  {
    name: 'an array index',
    live: () => [1, [2, 3]],
    steps: [1, 0],
    leaf: 2,
    replaced: () => [1, ['X', 3]],
  },
  {
    name: 'a Map keyed by objects that look alike',
    live: () =>
      new Map([
        [k1, 'a'],
        [k2, 'b'],
      ]),
    steps: [1],
    leaf: 'b',
    replaced: () =>
      new Map([
        [k1, 'a'],
        [k2, 'X'],
      ]),
  },
  {
    name: 'a Map keyed by strings that read like indices',
    live: () =>
      new Map([
        ['1', 'one'],
        ['0', 'zero'],
      ]),
    steps: [0],
    leaf: 'one',
    replaced: () =>
      new Map([
        ['1', 'X'],
        ['0', 'zero'],
      ]),
  },
  {
    name: 'a Set member',
    live: () => new Set(['a', { b: 1 }]),
    steps: [1, 'b'],
    leaf: 1,
    replaced: () => new Set(['a', { b: 'X' }]),
  },
  {
    name: 'an object inside a Map inside an array',
    live: () => [new Map([['k', { v: 1 }]])],
    steps: [0, 0, 'v'],
    leaf: 1,
    replaced: () => [new Map([['k', { v: 'X' }]])],
  },
];

const encode = (v: unknown) => dehydrate(v, 9);

for (const row of rows) {
  test(`the page reads, and the panel splices, the same entry: ${row.name}`, () => {
    expect(readLive(row.live(), row.steps)).toBe(row.leaf);
    expect(writeEncoded(encode(row.live()), row.steps, 'X')).toEqual(encode(row.replaced()));
  });
}

// What ValueView does when it renders a child: it knows the entry's label and position.
test('a child of a Map or Set is addressed by its position, any other child by its key', () => {
  const map = encode(
    new Map([
      [k1, 'a'],
      [k2, 'b'],
    ]),
  );
  expect(childStep(map, '[object Object]', 1)).toBe(1);
  expect(childStep(encode(new Set(['a', 'b'])), 'b', 1)).toBe(1);
  expect(childStep({ __runespect: 'partial', value: map, size: 9 }, 'k', 1)).toBe(1);
  expect(childStep(encode({ a: 1, b: 2 }), 'b', 1)).toBe('b');
  expect(childStep(encode([5, 6]), '1', 1)).toBe('1');
});

test('a splice copies only the branch it changes, and an empty path replaces the value', () => {
  const original = { a: { b: 1 }, list: [1, 2] };
  const updated = writeEncoded(original, ['a', 'b'], 42) as typeof original;
  expect(original).toEqual({ a: { b: 1 }, list: [1, 2] });
  expect(updated).toEqual({ a: { b: 42 }, list: [1, 2] });
  expect(updated.list).toBe(original.list);
  expect(writeEncoded(5, [], 9)).toBe(9);
});

test('an entry a Map or Set no longer has leaves the encoded value unchanged', () => {
  const map = encode(new Map([['a', 1]]));
  expect(writeEncoded(map, [3], 'late')).toEqual(map);
  const set = encode(new Set([1]));
  expect(writeEncoded(set, [3], 'late')).toEqual(set);
});

test('a path past the end of the live value reads nothing', () => {
  expect(readLive({ a: 1 }, ['a', 'b'])).toBeUndefined();
  expect(readLive(new Map([['a', 1]]), [4])).toBeUndefined();
});
