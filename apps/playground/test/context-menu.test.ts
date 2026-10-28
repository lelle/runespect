import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { ContextMenu, Tree, Detail } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const counter: SerializedNode = {
  id: 1,
  name: 'Counter',
  parent: null,
  children: [],
  snippets: [],
  values: { count: 5 },
  writable: ['count'],
  kinds: { count: 'state' },
  loc: 'src/Counter.svelte:3',
};

function mountInto(Comp: any, props: Record<string, unknown>): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Comp, { target, props });
  flushSync();
  return target;
}

const rightClick = (el: Element) =>
  el.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }),
  );

const menuLabels = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid="runespect-context-menu"] button')].map((b) =>
    b.textContent?.trim(),
  );

function open(items: any[], onclose = () => {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(ContextMenu, { target, props: { x: 10, y: 20, items, onclose } });
  flushSync();
  return target;
}

test('renders items at the given position; a disabled item is inert', () => {
  const ran: string[] = [];
  const target = open([
    { label: 'Open', onClick: () => ran.push('open') },
    { label: 'Nope', onClick: () => ran.push('nope'), disabled: true },
  ]);
  const menu = target.querySelector('[data-testid="runespect-context-menu"]') as HTMLElement;
  expect(menu).toBeTruthy();
  expect(menu.style.top).toBe('20px');
  expect(menu.style.left).toBe('10px');

  const buttons = [...menu.querySelectorAll('button')];
  expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Open', 'Nope']);
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
});

test('clicking an item runs it and closes the menu', () => {
  const ran: string[] = [];
  let closed = false;
  const target = open([{ label: 'Log', onClick: () => ran.push('log') }], () => (closed = true));
  (target.querySelector('button[role="menuitem"]') as HTMLButtonElement).click();
  flushSync();
  expect(ran).toEqual(['log']);
  expect(closed).toBe(true);
});

test('Escape closes the menu', () => {
  let closed = false;
  open([{ label: 'X', onClick: () => {} }], () => (closed = true));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  flushSync();
  expect(closed).toBe(true);
});

test('a click outside the menu closes it', () => {
  let closed = false;
  open([{ label: 'X', onClick: () => {} }], () => (closed = true));
  document.body.click(); // outside the menu
  flushSync();
  expect(closed).toBe(true);
});

test('Tree: right-clicking a names-only node opens a node menu; Log fires onLog', () => {
  const logged: SerializedNode[] = [];
  const target = mountInto(Tree, {
    nodes: [counter],
    namesOnly: true,
    onLog: (n: SerializedNode) => logged.push(n),
  });
  rightClick(target.querySelector('[data-select="Counter"]')!);
  flushSync();
  expect(menuLabels(target)).toEqual([
    'Open in editor',
    'Log to console',
    'Highlight in page',
    'Copy name',
  ]);

  const logItem = [
    ...target.querySelectorAll('[data-testid="runespect-context-menu"] button'),
  ].find((b) => b.textContent?.trim() === 'Log to console') as HTMLButtonElement;
  logItem.click();
  flushSync();
  expect(logged).toEqual([counter]);
  // menu closes after the action
  expect(target.querySelector('[data-testid="runespect-context-menu"]')).toBeNull();
});

test('Detail: right-clicking a value row opens a value menu; Copy fires onCopy', () => {
  const copied: unknown[] = [];
  const target = mountInto(Detail, { node: counter, onCopy: (v: unknown) => copied.push(v) });
  rightClick(target.querySelector('[data-detail-row="Counter.count"]')!);
  flushSync();
  expect(menuLabels(target)).toEqual(['Copy value', 'Store as $r', 'Log to console']);

  const copyItem = [
    ...target.querySelectorAll('[data-testid="runespect-context-menu"] button'),
  ].find((b) => b.textContent?.trim() === 'Copy value') as HTMLButtonElement;
  copyItem.click();
  flushSync();
  expect(copied).toEqual([5]);
});

test('the arrow keys move through the enabled items, around both ends; other keys pass', () => {
  const target = open([
    { label: 'First', onClick: () => {} },
    { label: 'Off', onClick: () => {}, disabled: true },
    { label: 'Middle', onClick: () => {} },
    { label: 'Last', onClick: () => {} },
  ]);
  const focused = () => (document.activeElement as HTMLElement | null)?.textContent?.trim();
  const press = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(e);
    return e.defaultPrevented;
  };
  expect(focused()).toBe('First');

  expect(press('ArrowDown')).toBe(true);
  expect(focused()).toBe('Middle'); // past the disabled one
  press('ArrowUp');
  expect(focused()).toBe('First');
  press('ArrowUp');
  expect(focused()).toBe('Last');
  press('ArrowDown');
  expect(focused()).toBe('First');
  expect(press('a')).toBe(false);
  expect(focused()).toBe('First');
  target.remove();
});
