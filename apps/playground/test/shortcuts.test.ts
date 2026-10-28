import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Panel, isTypingTarget } from '@runespect/ui/internal';

beforeEach(() => localStorage.clear());

test('isTypingTarget: true for form fields / editable, false otherwise', () => {
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  expect(isTypingTarget(document.createElement('input'))).toBe(true);
  expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
  expect(isTypingTarget(document.createElement('select'))).toBe(true);
  expect(isTypingTarget(editable)).toBe(true);
  expect(isTypingTarget(document.createElement('div'))).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});

function mountPanel() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport: { send: () => {}, onMessage: () => () => {} } } });
  flushSync();
  return target;
}

test('panel shortcut: "/" focuses the search input', () => {
  const target = mountPanel();
  const search = target.querySelector('[data-testid="runespect-search"]') as HTMLInputElement;
  expect(document.activeElement).not.toBe(search);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
  flushSync();
  expect(document.activeElement).toBe(search);
});

test('panel shortcut: Escape clears a non-empty search', () => {
  const target = mountPanel();
  const search = target.querySelector('[data-testid="runespect-search"]') as HTMLInputElement;
  search.value = 'List';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(search.value).toBe('List');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync();
  expect(search.value).toBe(''); // cleared
});
