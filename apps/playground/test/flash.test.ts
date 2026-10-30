import { test, expect, vi } from 'vitest';
import { tick } from 'svelte';
import { render } from '@testing-library/svelte';
import { Tree, changedKeys, Flasher } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const flNode = (values: Record<string, unknown>): SerializedNode => ({
  id: 1,
  name: 'C',
  parent: null,
  children: [],
  snippets: [],
  values,
  writable: [],
});

test('Flasher: first sight is calm; a changed symbol flashes, then clears after the window', () => {
  vi.useFakeTimers();
  try {
    const f = new Flasher();
    f.update([flNode({ count: 1 })]);
    expect(f.isFlashing(1, 'count')).toBe(false); // first sight never flashes
    f.update([flNode({ count: 2 })]);
    expect(f.isFlashing(1, 'count')).toBe(true);
    expect(f.nodeFlashing(1)).toBe(true);
    vi.advanceTimersByTime(700);
    expect(f.isFlashing(1, 'count')).toBe(false);
    expect(f.nodeFlashing(1)).toBe(false);
    f.destroy();
  } finally {
    vi.useRealTimers();
  }
});

test('Flasher: each change turns the flash, so the animation starts over', () => {
  vi.useFakeTimers();
  try {
    const f = new Flasher();
    f.update([flNode({ count: 1, other: 1 })]);
    f.update([flNode({ count: 2, other: 1 })]);
    expect(f.flashAgain(1, 'count')).toBe(false);
    expect(f.nodeFlashAgain(1)).toBe(false);

    f.update([flNode({ count: 3, other: 1 })]);
    expect(f.flashAgain(1, 'count')).toBe(true);
    expect(f.flashAgain(1, 'other')).toBe(false);
    expect(f.nodeFlashAgain(1)).toBe(true);

    f.update([flNode({ count: 3, other: 1 })]); // nothing changed: the blink runs on
    expect(f.flashAgain(1, 'count')).toBe(true);

    f.update([flNode({ count: 4, other: 2 })]); // two values, one node name: it still turns once
    expect(f.flashAgain(1, 'count')).toBe(false);
    expect(f.nodeFlashAgain(1)).toBe(false);

    vi.advanceTimersByTime(700);
    f.update([flNode({ count: 5, other: 2 })]);
    expect(f.flashAgain(1, 'count')).toBe(false);
    f.destroy();
  } finally {
    vi.useRealTimers();
  }
});

// Pure flash-diff logic.
test('changedKeys: first sight never flashes', () => {
  expect(changedKeys(undefined, { count: 1 })).toEqual([]);
});

test('changedKeys: only changed primitives flash', () => {
  expect(changedKeys({ count: 1, name: 'a' }, { count: 2, name: 'a' })).toEqual(['count']);
});

test('changedKeys: unchanged values do not flash (no false blink)', () => {
  expect(changedKeys({ count: 1 }, { count: 1 })).toEqual([]);
});

test('changedKeys: a newly appeared key flashes', () => {
  expect(changedKeys({ count: 1 }, { count: 1, extra: 9 })).toEqual(['extra']);
});

test('changedKeys: deep-equal objects do not flash, changed ones do', () => {
  expect(changedKeys({ o: { a: 1 } }, { o: { a: 1 } })).toEqual([]);
  expect(changedKeys({ o: { a: 1 } }, { o: { a: 2 } })).toEqual(['o']);
});

// <Tree> applies the flash class only to values that changed, and not on first render.
const node = (values: Record<string, unknown>, writable: string[] = []) => [
  { id: 1, name: 'Counter', parent: null, children: [], values, snippets: [], writable },
];

test('Tree: no flash on first render', () => {
  const { container } = render(Tree, { nodes: node({ count: 1, doubled: 2 }) });
  expect(container.querySelector('.rs-flash')).toBeNull();
});

test('Tree: only the changed value flashes', async () => {
  const { container, rerender } = render(Tree, {
    nodes: node({ count: 1, doubled: 2 }, ['count']),
  });
  // count changes, doubled stays the same → only count's input flashes.
  await rerender({ nodes: node({ count: 2, doubled: 2 }, ['count']) });
  await tick();

  const countInput = container.querySelector('[data-edit="Counter.count"]')!;
  const doubledVal = container.querySelector('[data-value="Counter.doubled"]')!;
  expect(countInput.classList.contains('rs-flash')).toBe(true);
  expect(doubledVal.classList.contains('rs-flash')).toBe(false);
});
