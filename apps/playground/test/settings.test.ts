import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Panel } from '@runespect/ui/internal';

beforeEach(() => localStorage.clear());

function mountPanel() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport: { send: () => {}, onMessage: () => () => {} } } });
  flushSync();
  return target;
}

const gear = (t: HTMLElement) =>
  t.querySelector('[data-testid="runespect-settings"]') as HTMLElement;
const flashToggle = (t: HTMLElement) =>
  t.querySelector('[data-setting="Flash on update"]') as HTMLInputElement;

test('settings menu: the gear opens a dropdown with a "Flash on update" toggle (default on)', () => {
  const target = mountPanel();
  expect(target.querySelector('[data-testid="runespect-settings-menu"]')).toBeNull(); // closed
  gear(target).click();
  flushSync();
  expect(target.querySelector('[data-testid="runespect-settings-menu"]')).toBeTruthy();
  expect(flashToggle(target).checked).toBe(true);
});

test('settings menu: toggling "Flash on update" persists across remounts', () => {
  const target = mountPanel();
  gear(target).click();
  flushSync();
  flashToggle(target).click(); // turn off
  flushSync();
  expect(flashToggle(target).checked).toBe(false);

  const target2 = mountPanel(); // fresh mount restores from localStorage
  gear(target2).click();
  flushSync();
  expect(flashToggle(target2).checked).toBe(false);
});

test('settings menu: the Theme select switches the panel theme and persists', () => {
  const target = mountPanel();
  const root = () => target.querySelector('[data-testid="runespect-panel"]') as HTMLElement;
  gear(target).click();
  flushSync();
  const sel = target.querySelector('[data-setting="Theme"]') as HTMLSelectElement;
  expect(sel).toBeTruthy();

  sel.value = 'dark';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(root().getAttribute('data-theme')).toBe('dark');

  const target2 = mountPanel(); // fresh mount restores the chosen theme
  expect(
    (target2.querySelector('[data-testid="runespect-panel"]') as HTMLElement).getAttribute(
      'data-theme',
    ),
  ).toBe('dark');
});

test('settings menu: "Expand values" toggle persists across remounts', () => {
  const target = mountPanel();
  gear(target).click();
  flushSync();
  const expand = target.querySelector('[data-setting="Expand values"]') as HTMLInputElement;
  expect(expand.checked).toBe(false); // default off
  expand.click();
  flushSync();

  const target2 = mountPanel();
  gear(target2).click();
  flushSync();
  expect(
    (target2.querySelector('[data-setting="Expand values"]') as HTMLInputElement).checked,
  ).toBe(true);
});

test('settings menu: clicking outside closes it', () => {
  const target = mountPanel();
  gear(target).click();
  flushSync();
  expect(target.querySelector('[data-testid="runespect-settings-menu"]')).toBeTruthy();
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flushSync();
  expect(target.querySelector('[data-testid="runespect-settings-menu"]')).toBeNull();
});
