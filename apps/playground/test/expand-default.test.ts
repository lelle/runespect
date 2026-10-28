import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Detail } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const node: SerializedNode = {
  id: 1,
  name: 'C',
  parent: null,
  children: [],
  values: { obj: { a: 1, b: 2 } },
  snippets: [],
  writable: [],
};

function mountDetail(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Detail, { target, props: { node, ...props } });
  flushSync();
  return target;
}

test('expand-default off (default): a detail value renders collapsed', () => {
  const target = mountDetail({});
  const toggle = target.querySelector('[data-detail-value="C.obj"] [data-expand]') as HTMLElement;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(target.querySelector('[data-detail-value="C.obj"] .rs-key')).toBeNull(); // no entries shown
});

test('expand-default on: the top level of a value renders expanded', () => {
  const target = mountDetail({ expandValues: true });
  const toggle = target.querySelector('[data-detail-value="C.obj"] [data-expand]') as HTMLElement;
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(target.querySelectorAll('[data-detail-value="C.obj"] .rs-key').length).toBe(2); // a, b
});
