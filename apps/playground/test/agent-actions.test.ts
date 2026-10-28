import { test, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';

beforeEach(() => {
  agent.reset();
  agent.activate();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function tagged(file: string): HTMLElement {
  const el = document.createElement('div');
  (el as unknown as { __svelte_meta: unknown }).__svelte_meta = { loc: { file, line: 1 } };
  document.body.appendChild(el);
  return el;
}

test('highlight(id) draws a box over the node element, null clears it', () => {
  const id = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  tagged('src/Foo.svelte');

  agent.highlight(id);
  const box = document.querySelector('[data-runespect-highlight]') as HTMLElement;
  expect(box).toBeTruthy();
  expect(box.style.display).toBe('block');

  agent.highlight(null);
  expect(box.style.display).toBe('none');
});

test('startPick reports the picked node id on click', () => {
  const id = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const el = tagged('src/Foo.svelte');

  let picked: number | null | undefined;
  agent.startPick((p) => (picked = p));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(picked).toBe(id);
});

test('logNode logs the node and storeGlobal sets window.$r', () => {
  const id = agent.enter('Foo');
  agent.report(id, 'count', 7);

  const logs: unknown[][] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a);
  try {
    agent.logNode(id);
  } finally {
    console.log = orig;
  }
  expect(logs.some((a) => String(a[0]).includes('Foo'))).toBe(true);

  agent.storeGlobal(id, 'count');
  expect((window as unknown as { $r: unknown }).$r).toBe(7);
});

// The box is position:fixed with viewport coordinates, so it has to be recomputed when the page
// moves under it — otherwise "Highlight in page" leaves a rectangle stuck where the element used
// to be as soon as you scroll.
test('the highlight follows its element when the page scrolls', () => {
  const id = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const el = tagged('src/Foo.svelte');
  let top = 100;
  el.getBoundingClientRect = () => ({ top, left: 10, width: 50, height: 20 }) as DOMRect;

  agent.highlight(id);
  const box = document.querySelector('[data-runespect-highlight]') as HTMLElement;
  expect(box.style.top).toBe('100px');

  top = 40; // the page scrolled by 60
  window.dispatchEvent(new Event('scroll'));
  expect(box.style.top).toBe('40px');
});

test('the highlight follows a scrolling container, not just the window', () => {
  const id = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const el = tagged('src/Foo.svelte');
  let top = 100;
  el.getBoundingClientRect = () => ({ top, left: 10, width: 50, height: 20 }) as DOMRect;
  agent.highlight(id);

  top = 55;
  el.dispatchEvent(new Event('scroll', { bubbles: false })); // a scroll inside the page
  expect((document.querySelector('[data-runespect-highlight]') as HTMLElement).style.top).toBe(
    '55px',
  );
});

test('clearing the highlight stops it tracking', () => {
  const id = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const el = tagged('src/Foo.svelte');
  let top = 100;
  el.getBoundingClientRect = () => ({ top, left: 10, width: 50, height: 20 }) as DOMRect;
  agent.highlight(id);
  agent.highlight(null);

  top = 10;
  window.dispatchEvent(new Event('scroll'));
  const box = document.querySelector('[data-runespect-highlight]') as HTMLElement;
  expect(box.style.display).toBe('none');
  expect(box.style.top).toBe('100px'); // not repositioned while hidden
});

test('reportFrom records the read value, or an error marker when reading throws', () => {
  const id = agent.enter('Foo', null);
  agent.reportFrom(id, 'ok', () => ({ a: 1 }));
  agent.reportFrom(id, 'broken', () => {
    throw new TypeError('nope');
  });
  flushSync();

  expect(agent.read(id, 'ok')).toEqual({ a: 1 });
  expect(agent.read(id, 'broken')).toEqual({ __runespect: 'error', message: 'nope' });
});

const box = () => document.querySelector('[data-runespect-highlight]') as HTMLElement | null;

test('Escape ends a pick and reports that nothing was picked', () => {
  const el = tagged('src/Foo.svelte');
  agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const picked: (number | null)[] = [];
  agent.startPick((id) => picked.push(id));

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true })); // the pick is over

  expect(picked).toEqual([null]);
});

test('while picking, the box is over the component under the pointer, and goes off one', () => {
  const el = tagged('src/Foo.svelte');
  const plain = document.body.appendChild(document.createElement('p'));
  agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  agent.startPick(() => {});

  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  expect(box()?.style.display).toBe('block');
  plain.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  expect(box()?.style.display).toBe('none'); // reset() in beforeEach ends the pick
});

test('highlighting a node with no element in the page clears the box', () => {
  const shown = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const gone = agent.enter('Gone', null, { loc: '/abs/src/Gone.svelte' });
  tagged('src/Foo.svelte');
  agent.highlight(shown);

  agent.highlight(gone);

  expect(box()?.style.display).toBe('none');
});

// Moving from one node to the next keeps the listeners it has; the box follows the new element.
test('the highlight moves to another node and follows that one when the page scrolls', () => {
  const a = agent.enter('Foo', null, { loc: '/abs/src/Foo.svelte' });
  const b = agent.enter('Bar', null, { loc: '/abs/src/Bar.svelte' });
  tagged('src/Foo.svelte').getBoundingClientRect = () => ({ top: 5 }) as DOMRect;
  let top = 100;
  tagged('src/Bar.svelte').getBoundingClientRect = () => ({ top }) as DOMRect;
  agent.highlight(a);
  agent.highlight(b);

  top = 70;
  window.dispatchEvent(new Event('scroll'));
  expect(box()?.style.top).toBe('70px');
});

// A getter on the way may throw; $r then holds what the panel shows for the value.
test('storing a value whose live read throws stores what the agent reported', () => {
  const id = agent.enter('Foo');
  agent.reportFrom(id, 'broken', () => {
    throw new Error('only valid behind a guard');
  });
  flushSync();

  agent.storeGlobal(id, 'broken');

  expect((window as unknown as { $r: unknown }).$r).toEqual(agent.read(id, 'broken'));
  expect(agent.read(id, 'broken')).toMatchObject({ __runespect: 'error' });
});

test('logging a node that is gone logs nothing', () => {
  const logs: unknown[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => logs.push(a);
  try {
    agent.logNode(999);
  } finally {
    console.log = orig;
  }
  expect(logs).toEqual([]);
});
