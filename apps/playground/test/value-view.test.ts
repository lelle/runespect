import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import {
  Tree,
  formatValue,
  valueType,
  entriesOf,
  isExpandable,
  truncateString,
} from '@runespect/ui/internal';

// Type-dispatched formatting + type labels.
test('formatValue: primitives render verbatim/stringified', () => {
  expect(formatValue(42)).toBe('42');
  expect(formatValue('hi')).toBe('hi'); // raw so an input round-trips
  expect(formatValue(true)).toBe('true');
  expect(formatValue(null)).toBe('null');
  expect(formatValue(undefined)).toBe('undefined');
});

test('formatValue: collections show type + size', () => {
  expect(formatValue([1, 2, 3])).toBe('Array(3)');
  expect(formatValue(new Map([['a', 1]]))).toBe('Map(1)');
  expect(formatValue(new Set([1, 2]))).toBe('Set(2)');
});

test('formatValue: objects show a collapsed key preview', () => {
  expect(formatValue({})).toBe('{}');
  expect(formatValue({ a: 1, b: 2 })).toBe('{ a, b } (2)');
  expect(formatValue({ a: 1, b: 2, c: 3, d: 4 })).toBe('{ a, b, c, … } (4)');
});

test('formatValue: typed arrays and ArrayBuffer get a constructor-labelled size', () => {
  expect(formatValue(new Uint8Array([1, 2, 3]))).toBe('Uint8Array(3)');
  expect(formatValue(new Float64Array(2))).toBe('Float64Array(2)');
  expect(formatValue(new ArrayBuffer(8))).toBe('ArrayBuffer(8)');
});

test('entriesOf / isExpandable: typed arrays drill in like arrays; ArrayBuffer does not', () => {
  expect(entriesOf(new Uint8Array([10, 20]))).toEqual([
    ['0', 10],
    ['1', 20],
  ]);
  expect(isExpandable(new Uint8Array([1]))).toBe(true);
  expect(isExpandable(new Uint8Array(0))).toBe(false);
  expect(isExpandable(new ArrayBuffer(8))).toBe(false); // opaque bytes, no entries
});

test('formatValue: Date and function markers', () => {
  expect(formatValue(new Date('2020-01-02T03:04:05.000Z'))).toBe('2020-01-02T03:04:05.000Z');
  expect(formatValue({ __runespect: 'function', name: 'onSave' })).toBe('ƒ onSave');
  expect(formatValue({ __runespect: 'function', name: '' })).toBe('ƒ');
});

test('formatValue: richer built-ins (URLSearchParams, Promise, HTML element)', () => {
  expect(formatValue(new URLSearchParams('a=1&b=2'))).toBe('URLSearchParams(2)');
  expect(formatValue(Promise.resolve(1))).toBe('Promise');
  const el = document.createElement('div');
  el.id = 'main';
  el.className = 'card big';
  expect(formatValue(el)).toBe('<div#main.card.big>');
  expect(formatValue(document.createElement('span'))).toBe('<span>'); // no id/class
});

test('entriesOf / isExpandable: URLSearchParams drills into its entries; Promise/element are leaves', () => {
  expect(entriesOf(new URLSearchParams('a=1&b=2'))).toEqual([
    ['a', '1'],
    ['b', '2'],
  ]);
  expect(isExpandable(new URLSearchParams('a=1'))).toBe(true);
  expect(isExpandable(new URLSearchParams())).toBe(false);
  expect(isExpandable(Promise.resolve(1))).toBe(false);
  expect(isExpandable(document.createElement('div'))).toBe(false);
});

test('an encoded URLSearchParams is shown like a live one: its size, then its pairs', () => {
  const params = {
    __runespect: 'urlsearchparams',
    entries: [
      ['a', '1'],
      ['a', '3'],
    ],
  };
  expect(formatValue(params)).toBe('URLSearchParams(2)');
  expect(valueType(params)).toBe('urlsearchparams');
  expect(entriesOf(params)).toEqual([
    ['a', '1'],
    ['a', '3'],
  ]);
  expect(formatValue({ __runespect: 'partial', value: params, size: 150 })).toBe(
    'URLSearchParams(150)',
  );
});

test('valueType: normalizes HTML elements to "element"; Promise/URLSearchParams via tag', () => {
  expect(valueType(document.createElement('div'))).toBe('element');
  expect(valueType(Promise.resolve(1))).toBe('promise');
  expect(valueType(new URLSearchParams())).toBe('urlsearchparams');
});

test('valueType: dispatches on the underlying type', () => {
  expect(valueType(1)).toBe('number');
  expect(valueType([])).toBe('array');
  expect(valueType(new Map())).toBe('map');
  expect(valueType(null)).toBe('null');
  expect(valueType({ __runespect: 'function', name: 'f' })).toBe('function');
});

// Entries + expandability for drill-in.
test('entriesOf: arrays, objects, maps, sets; primitives have none', () => {
  expect(entriesOf([10, 20])).toEqual([
    ['0', 10],
    ['1', 20],
  ]);
  expect(entriesOf({ a: 1, b: 2 })).toEqual([
    ['a', 1],
    ['b', 2],
  ]);
  expect(entriesOf(new Map([['k', 9]]))).toEqual([['k', 9]]);
  expect(entriesOf(new Set(['x']))).toEqual([['0', 'x']]);
  expect(entriesOf(42)).toEqual([]);
});

test('isExpandable: only non-empty containers', () => {
  expect(isExpandable({ a: 1 })).toBe(true);
  expect(isExpandable([1])).toBe(true);
  expect(isExpandable({})).toBe(false);
  expect(isExpandable('hi')).toBe(false);
  expect(isExpandable({ __runespect: 'function', name: 'f' })).toBe(false); // a function is not a value tree
});

// A dehydrated marker renders as an expandable preview with no local entries.
const marker = { __runespect: 'dehydrated', type: 'object', preview: '{ a, b } (2)', size: 2 };

test('valueView helpers treat a dehydrated marker as its stubbed container', () => {
  expect(valueType(marker)).toBe('object');
  expect(formatValue(marker)).toBe('{ a, b } (2)'); // uses the marker preview
  expect(isExpandable(marker)).toBe(true); // size > 0 → expandable (fetches on demand)
  expect(entriesOf(marker)).toEqual([]); // no local entries until hydrated
  const empty = { __runespect: 'dehydrated', type: 'array', preview: 'Array(0)', size: 0 };
  expect(isExpandable(empty)).toBe(false);
});

// String truncation (render-bounding for long strings).
test('truncateString: long strings get cut with an ellipsis; short ones pass through', () => {
  expect(truncateString('hello', 10)).toBe('hello');
  expect(truncateString('x'.repeat(15), 10)).toBe('x'.repeat(10) + '…');
  expect(truncateString('', 10)).toBe('');
});

// Keyboard navigation inside a value tree (expand/collapse + move focus between toggles).
test('ValueView: ←/→ expand-collapse the focused toggle; ↑/↓ move focus between toggles', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { obj: { a: { x: 1 }, b: { y: 2 } } },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();
  const cell = target.querySelector('[data-value="C.obj"]') as HTMLElement;
  const rootToggle = cell.querySelector('[data-expand]') as HTMLButtonElement;
  const key = (el: Element, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  expect(rootToggle.getAttribute('aria-expanded')).toBe('false');
  rootToggle.focus();
  key(rootToggle, 'ArrowRight'); // → expands
  flushSync();
  expect(rootToggle.getAttribute('aria-expanded')).toBe('true');

  const toggles = cell.querySelectorAll('[data-expand]');
  expect(toggles.length).toBe(3); // root + a + b
  rootToggle.focus();
  key(rootToggle, 'ArrowDown'); // ↓ moves focus to the next toggle
  expect(document.activeElement).toBe(toggles[1]);
  key(toggles[1], 'ArrowUp'); // ↑ moves it back
  expect(document.activeElement).toBe(rootToggle);

  key(rootToggle, 'ArrowLeft'); // ← collapses
  flushSync();
  expect(rootToggle.getAttribute('aria-expanded')).toBe('false');
});

// Render-bounding in the tree: long string leaves are truncated (full value in title).
test('Tree: a long string value is truncated for display, with the full value on hover', () => {
  const long = 'a'.repeat(500);
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { s: long },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();
  const str = target.querySelector('.rs-str') as HTMLElement;
  expect(str).toBeTruthy();
  expect(str.textContent!.endsWith('…')).toBe(true);
  expect(str.textContent!.length).toBeLessThan(long.length); // truncated
  expect(str.title).toBe(long); // full value available on hover
});

// Render-bounding: a large collection caps how many entries render, with "show more".
test('Tree: expanding a large array caps entries and reveals the rest on demand', () => {
  const big = Array.from({ length: 250 }, (_, i) => i);
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { arr: big },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();
  const cell = target.querySelector('[data-value="C.arr"]') as HTMLElement;
  (cell.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();

  expect(cell.querySelectorAll('.rs-key').length).toBe(100); // capped at the entry limit
  const more = cell.querySelector('[data-show-more]') as HTMLButtonElement;
  expect(more).toBeTruthy();
  expect(more.textContent).toContain('150'); // 250 - 100 remaining

  more.click();
  flushSync();
  expect(cell.querySelectorAll('.rs-key').length).toBe(200); // one more page revealed
});

// <Tree> drills into a nested value on toggle.
test('Tree: expanding a read-only object reveals its entries', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { data: { a: 1, b: 2 } },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();

  const cell = target.querySelector('[data-value="C.data"]') as HTMLElement;
  expect(cell.textContent).toContain('{ a, b } (2)');
  expect(cell.querySelector('.rs-key')).toBeNull(); // collapsed: no entries yet

  (cell.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  const keys = [...cell.querySelectorAll('.rs-key')].map((e) => e.textContent);
  expect(keys).toEqual(['a:', 'b:']);
});

// A typed array renders its labelled preview and drills into indexed entries.
test('Tree: a typed array shows its constructor preview and expands to indexed entries', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { bytes: new Uint8Array([5, 6, 7]) },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();
  const cell = target.querySelector('[data-value="C.bytes"]') as HTMLElement;
  expect(cell.textContent).toContain('Uint8Array(3)');
  (cell.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  expect([...cell.querySelectorAll('.rs-key')].map((e) => e.textContent)).toEqual([
    '0:',
    '1:',
    '2:',
  ]);
});

// <Tree> renders the preview + a data-type attribute for read-only values.
test('Tree: read-only value shows a type-aware preview and data-type', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'C',
          parent: null,
          children: [],
          values: { items: [1, 2, 3] },
          snippets: [],
          writable: [],
        },
      ],
    },
  });
  flushSync();

  const val = target.querySelector('[data-value="C.items"]') as HTMLElement;
  expect(val.textContent).toContain('Array(3)');
  expect(val.getAttribute('data-type')).toBe('array');
});

test('formatValue: a value that threw while being read shows the error, not a value', () => {
  const failed = {
    __runespect: 'error',
    message: "Cannot read properties of null (reading 'name')",
  };
  expect(formatValue(failed)).toBe("⚠ Cannot read properties of null (reading 'name')");
  expect(valueType(failed)).toBe('error');
  expect(isExpandable(failed)).toBe(false);
});

// Keys that read alike in the panel must not collide: Svelte throws on a duplicate key in a keyed
// each block, which would take the whole value view down.
test('ValueView: a Map whose keys read alike renders every entry', () => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const objectKey = { __runespect: 'dehydrated', type: 'object', preview: '{}', size: 0 };
  const nodes = [
    {
      id: 1,
      name: 'C',
      parent: null,
      children: [],
      snippets: [],
      writable: [],
      values: {
        objects: {
          __runespect: 'map',
          entries: [
            [objectKey, 'first'],
            [objectKey, 'second'],
          ],
        },
        mixed: new Map<unknown, string>([
          [1, 'number'],
          ['1', 'string'],
        ]),
      },
    },
  ];
  mount(Tree, { target, props: { nodes, expandValues: true } });
  flushSync();

  expect(target.textContent).toContain('first');
  expect(target.textContent).toContain('second');
  expect(target.textContent).toContain('number');
  expect(target.textContent).toContain('string');
});
