import { test, expect } from 'vitest';
import { detailGroups, coerceInput } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const node = (extra: Partial<SerializedNode>): SerializedNode => ({
  id: 1,
  name: 'C',
  parent: null,
  children: [],
  snippets: [],
  values: {},
  writable: [],
  ...extra,
});

test('groups symbols by kind in a stable order: props, state, derived, stores, class', () => {
  const groups = detailGroups(
    node({
      values: { label: 'x', count: 0, doubled: 0, $store: 1, 'box.value': 2 },
      kinds: {
        label: 'prop',
        count: 'state',
        doubled: 'derived',
        $store: 'store',
        'box.value': 'class',
      },
    }),
  );
  expect(groups.map((g) => g.kind)).toEqual(['prop', 'state', 'derived', 'store', 'class']);
  expect(groups[0]).toMatchObject({ label: 'props', symbols: ['label'] });
  expect(groups.find((g) => g.kind === 'class')?.symbols).toEqual(['box.value']);
});

test('context-consumed values get their own group, after class fields', () => {
  const groups = detailGroups(
    node({
      values: { count: 0, theme: 'dark' },
      kinds: { count: 'state', theme: 'context' },
    }),
  );
  expect(groups.map((g) => g.kind)).toEqual(['state', 'context']);
  expect(groups.find((g) => g.kind === 'context')).toMatchObject({
    label: 'context',
    symbols: ['theme'],
  });
});

test('symbols with no kind metadata fall back to an "other" group', () => {
  const groups = detailGroups(node({ values: { a: 1, b: 2 } }));
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ kind: 'other', label: 'other', symbols: ['a', 'b'] });
});

test('empty node yields no groups', () => {
  expect(detailGroups(node({}))).toEqual([]);
});

test('coerceInput keeps the original type when editing', () => {
  expect(coerceInput(5, '9')).toBe(9);
  expect(coerceInput(5, 'abc')).toBe(5); // NaN → keep original
  expect(coerceInput(true, 'false')).toBe(false);
  expect(coerceInput('hi', 'bye')).toBe('bye');
});

test('coerceInput keeps a number/boolean when the field is cleared instead of coercing to 0/false', () => {
  expect(coerceInput(5, '')).toBe(5); // clearing a number must not write 0
  expect(coerceInput(5, '   ')).toBe(5);
  expect(coerceInput(true, '')).toBe(true); // clearing a boolean must not write false
  // but a string field can legitimately be cleared to empty
  expect(coerceInput('hi', '')).toBe('');
});
