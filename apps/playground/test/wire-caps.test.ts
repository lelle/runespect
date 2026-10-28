import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { dehydrate } from '@runespect/agent/protocol/internal';
import { Panel } from '@runespect/ui/internal';
import { inspectMessage, isPartialValue } from '@runespect/agent/protocol/internal';

// A value is sent in full on every change it makes, so one wide list or long text would make every
// flush as slow as the value is large. The wire carries the first entries and the total; the panel fetches the rest when asked.
let disconnect: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
});

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i);
const wide = (n: number) => Object.fromEntries(numbers(n).map((i) => [`k${i}`, i]));

test('a container wider than the wire carries is sent as its first entries and its size', () => {
  const sent = (value: unknown): unknown[] => {
    const out = dehydrate(value, 1);
    expect(isPartialValue(out)).toBe(true);
    expect((out as { size: number }).size).toBe(250);
    const v = (out as { value: any }).value;
    return Array.isArray(v) ? v : (v.entries ?? v.values ?? Object.keys(v));
  };
  expect(sent(numbers(250))).toEqual(numbers(100));
  expect(sent(wide(250))).toHaveLength(100);
  expect(sent(new Map(numbers(250).map((i) => [i, i])))).toHaveLength(100);
  expect(sent(new Set(numbers(250)))).toHaveLength(100);
});

test('a long string is sent as its beginning and its length', () => {
  const out = dehydrate('x'.repeat(25_000), 1) as { head: string; length: number };
  expect(out.head).toBe('x'.repeat(10_000));
  expect(out.length).toBe(25_000);
});

test('a value within the limits is sent exactly as before', () => {
  expect(dehydrate(numbers(100), 1)).toEqual(numbers(100));
  expect(dehydrate(wide(100), 1)).toEqual(wide(100));
  expect(dehydrate('x'.repeat(10_000), 1)).toBe('x'.repeat(10_000));
});

test('a nested long string is capped too, not just one at the top', () => {
  const out = dehydrate({ text: 'y'.repeat(20_000) }, 1) as { text: { length: number } };
  expect(out.text.length).toBe(20_000);
});

test('the panel can ask for more of a value than the wire first carried', () => {
  const t = { sent: [] as any[], emit: (_: any) => {} };
  disconnect = agent.connect({
    send: (m: any) => t.sent.push(m),
    onMessage: (cb: any) => ((t.emit = cb), () => {}),
  });
  const id = agent.enter('List');
  agent.report(id, 'items', numbers(250));
  flushSync();

  t.emit({ ...inspectMessage(id, ['items'], 200) });
  const reply = t.sent.find((m) => m.kind === 'hydrate');
  expect(reply.value.value).toEqual(numbers(200));
  expect(reply.value.size).toBe(250);
});

test('"show more" past what was sent fetches the next entries, and shows them', () => {
  const sent: any[] = [];
  let listener: ((m: any) => void) | undefined;
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, {
    target,
    props: {
      transport: {
        send: (m: any) => sent.push(m),
        onMessage: (cb: any) => ((listener = cb), () => {}),
      },
    },
  });
  flushSync();
  const node = (items: unknown) => ({
    id: 1,
    name: 'List',
    parent: null,
    children: [],
    values: { items },
    snippets: [],
    writable: [],
  });
  listener!({ source: 'runespect', kind: 'tree', nodes: [node(dehydrate(numbers(250), 1))] });
  flushSync();
  (target.querySelector('[data-select="List"]') as HTMLElement).click();
  flushSync();
  const cell = () => target.querySelector('[data-detail-value="List.items"]')!;
  (cell().querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  expect(cell().querySelectorAll('.rs-key')).toHaveLength(100);
  expect(cell().querySelector('[data-show-more]')?.textContent).toContain('150 more');

  (cell().querySelector('[data-show-more]') as HTMLButtonElement).click();
  flushSync();
  expect(sent).toContainEqual(inspectMessage(1, ['items'], 200));

  listener!({
    source: 'runespect',
    kind: 'hydrate',
    id: 1,
    path: ['items'],
    value: dehydrate(numbers(250), 1, { limit: 200 }),
  });
  flushSync();
  expect(cell().querySelectorAll('.rs-key')).toHaveLength(200);
  expect(cell().querySelector('[data-show-more]')?.textContent).toContain('50 more');
});
