import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree, clipboardText } from '@runespect/ui/internal';

// Clipboard text formatting.
test('clipboardText: strings verbatim, objects as JSON, primitives stringified', () => {
  expect(clipboardText('hi')).toBe('hi');
  expect(clipboardText(42)).toBe('42');
  expect(clipboardText({ a: 1 })).toBe('{"a":1}');
  expect(clipboardText(undefined)).toBe('undefined');
});

// <Tree> exposes per-node log and per-value copy / store-as-global actions.
test('Tree wires log, copy and store-as-global actions', () => {
  const logged: unknown[] = [];
  const copied: unknown[] = [];
  const stored: unknown[][] = [];
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, {
    target,
    props: {
      nodes: [
        {
          id: 1,
          name: 'Counter',
          parent: null,
          children: [],
          values: { count: 5 },
          snippets: [],
          writable: ['count'],
        },
      ],
      onLog: (node: any) => logged.push(node),
      onCopy: (v: unknown) => copied.push(v),
      onStoreGlobal: (id: number, sym: string, v: unknown) => stored.push([id, sym, v]),
    },
  });
  flushSync();

  (target.querySelector('[data-log="Counter"]') as HTMLButtonElement).click();
  (target.querySelector('[data-copy="Counter.count"]') as HTMLButtonElement).click();
  (target.querySelector('[data-global="Counter.count"]') as HTMLButtonElement).click();
  flushSync();

  expect(logged).toHaveLength(1);
  expect((logged[0] as any).name).toBe('Counter');
  expect(copied).toEqual([5]);
  expect(stored).toEqual([[1, 'count', 5]]);
});
