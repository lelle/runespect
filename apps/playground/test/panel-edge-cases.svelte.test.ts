import { test, expect, beforeEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import { History, Split, ContextMenu, Flasher, compileMatcher } from '@runespect/ui/internal';
import { helloMessage, treeMessage, PROTOCOL_VERSION } from '@runespect/agent/protocol/internal';
import type { Commit, Message } from '@runespect/agent/protocol/internal';
import { mountPanel, node } from './helpers/panel';

// The panel UI at its edges: stored settings, following pages, scrolling, menus and labels.
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

const hello = (id: string, url: string): Message => ({
  ...helloMessage(PROTOCOL_VERSION, 0, { url, title: url }),
  from: id,
});

const panel = () => mountPanel();

// One RegExp tested against every name; with g or y it would resume where the last match ended.
test('a /regex/ search with the g or y flag matches every name it should', () => {
  for (const query of ['/a/g', '/a/y', '/a/gy']) {
    const m = compileMatcher(query)!;
    expect(
      ['a', 'a', 'a'].map((name) => m.test(name)),
      query,
    ).toEqual([true, true, true]);
  }
});

// Settings come from localStorage the app shares; a bad value falls back to the default.
test('the panel opens with bad stored settings, using the defaults instead', () => {
  localStorage.setItem('runespect:theme', JSON.stringify('blue'));
  localStorage.setItem('runespect:exclude', JSON.stringify(42));
  localStorage.setItem('runespect:splitPct', JSON.stringify('wide'));
  localStorage.setItem('runespect:tab', JSON.stringify('no-such-tab'));
  const p = panel();
  p.emit({ ...treeMessage([node(1, 'Counter')]) });
  expect(p.target.querySelector('[data-select="Counter"]')).not.toBeNull();
  expect(p.target.querySelector('[data-tab="tree"]')?.getAttribute('aria-selected')).toBe('true');
});

// Node ids are per page, so a selection carried over would point at an unrelated component.
test('following another page clears the selection and the tier of the previous one', () => {
  const p = panel();
  p.emit(hello('a', '/cart'));
  p.emit(hello('b', '/admin'));
  p.emit({ ...treeMessage([node(1, 'Cart')]), from: 'a' } as Message);
  p.click('[data-select="Cart"]');
  expect(p.target.querySelector('[data-detail-empty]')).toBeNull();

  p.click('[data-testid="runespect-source"]');
  p.click('[data-source="b"]');
  p.emit({ ...treeMessage([node(1, 'Admin')]), from: 'b' } as Message);
  expect(p.target.querySelector('[data-detail-empty]')).not.toBeNull();
  expect(p.target.querySelector('.rs-selected')).toBeNull();
});

// A manual pick sends each request once, so the page answers with one tree.
test('picking another page asks it once for its tree and once for its history', () => {
  const p = panel();
  p.emit(hello('a', '/cart'));
  p.emit(hello('b', '/admin'));
  p.click('[data-testid="runespect-source"]');
  const before = p.sent.length;
  p.click('[data-source="b"]');
  const asked = p.sent.slice(before).map((m) => m.kind);
  expect(asked.filter((k) => k === 'request')).toHaveLength(1);
  expect(asked.filter((k) => k === 'history-request')).toHaveLength(1);
});

// The list that scrolls is the outer element; and once the ring is full the count of rows
// stops growing, so "n new" counts new commits, not rows.
const commit = (seq: number): Commit => ({
  seq,
  t: seq,
  changes: [{ op: 'update', id: 1, name: 'C', symbol: 'n', from: seq - 1, to: seq }],
});
const commits = (from: number, to: number): Commit[] =>
  Array.from({ length: to - from + 1 }, (_, i) => commit(from + i));

test('scrolling the history stops it following, and new commits wait behind "n new"', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const props = $state({ commits: commits(1, 200) });
  mount(History, { target, props });
  flushSync();
  target.querySelector('[data-testid="runespect-history"]')!.dispatchEvent(new Event('scroll'));
  props.commits = commits(3, 202); // the ring is full: the same number of rows, two of them new
  flushSync();
  expect(target.querySelector('[data-testid="runespect-history-resume"]')?.textContent).toContain(
    '2 new',
  );
  expect(target.querySelector('[data-commit]')?.getAttribute('data-commit')).toBe('200');
});

// A node that left and came back is seen for the first time again, not compared with the
// values it had before it left.
test('a node that comes back after leaving does not flash as if it had changed', () => {
  const flasher = new Flasher();
  flasher.update([node(1, 'A', { n: 1 })]);
  flasher.update([]);
  flasher.update([node(1, 'A', { n: 2 })]);
  expect(flasher.isFlashing(1, 'n')).toBe(false);
  flasher.destroy();
});

test('a cancelled drag stops resizing', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const props = $state({ pct: 45, left: (() => {}) as any, right: (() => {}) as any });
  mount(Split, { target, props });
  flushSync();
  const separator = target.querySelector('[role="separator"]') as HTMLElement;
  separator.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
  window.dispatchEvent(new MouseEvent('pointercancel'));
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10 }));
  flushSync();
  expect(props.pct).toBe(45);
});

test('the context menu stays inside the window near its right and bottom edges', () => {
  // jsdom lays nothing out; a menu is as big as its CSS min-width and two rows.
  const measure = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 160, height: 60 } as DOMRect);
  const target = document.body.appendChild(document.createElement('div'));
  mount(ContextMenu, {
    target,
    props: {
      x: window.innerWidth - 5,
      y: window.innerHeight - 5,
      items: [{ label: 'Copy', onClick: () => {} }],
      onclose: () => {},
    },
  });
  flushSync();
  const menu = target.querySelector('[data-testid="runespect-context-menu"]') as HTMLElement;
  expect(parseFloat(menu.style.left)).toBeLessThan(window.innerWidth - 5);
  expect(parseFloat(menu.style.top)).toBeLessThan(window.innerHeight - 5);
  measure.mockRestore();
});

// Escape closes the menu and stops there, so the selection stays.
test('Escape in the tree closes the context menu and keeps the selection', () => {
  const p = panel();
  p.emit({ ...treeMessage([node(1, 'Counter')]) });
  p.click('[data-select="Counter"]');
  const tree = p.target.querySelector('[role="tree"]') as HTMLElement;
  tree.focus();
  p.target
    .querySelector('[data-select="Counter"]')!
    .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
  flushSync();
  expect(p.target.querySelector('[data-testid="runespect-context-menu"]')).not.toBeNull();

  tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync();
  expect(p.target.querySelector('[data-testid="runespect-context-menu"]')).toBeNull();
  expect(p.target.querySelector('.rs-selected')).not.toBeNull();
});

// What a screen reader announces for each control.
const accessibleName = (el: Element): string =>
  el.getAttribute('aria-label') ??
  (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
  el.closest('label')?.textContent ??
  el.textContent ??
  '';

test('every control in the panel has a name made of words, not just a glyph', () => {
  const p = panel();
  p.emit(hello('a', '/cart'));
  p.emit(hello('b', '/admin'));
  p.emit({ ...treeMessage([node(1, 'Counter', { n: 1 })]), from: 'a' } as Message);
  p.click('[data-select="Counter"]');
  const unnamed = [...p.target.querySelectorAll('button, input, select')]
    .filter((el) => !/[a-z]{2}/i.test(accessibleName(el)))
    .map((el) => el.outerHTML.slice(0, 80));
  expect(unnamed).toEqual([]);
});

test('menus are menus only when they hold menu items, and each tab names its panel', () => {
  const p = panel();
  p.emit(hello('a', '/cart'));
  p.emit(hello('b', '/admin'));
  p.click('[data-testid="runespect-source"]');
  (p.target.querySelector('[data-testid="runespect-settings"]') as HTMLElement)?.click();
  flushSync();
  for (const menu of p.target.querySelectorAll('[role="menu"]')) {
    const items = menu.querySelectorAll('[role^="menuitem"]');
    expect(items.length, menu.outerHTML.slice(0, 80)).toBe(
      menu.querySelectorAll('button, input, select').length,
    );
  }
  for (const tab of p.target.querySelectorAll('[role="tab"]')) {
    const panelId = tab.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    if (tab.getAttribute('aria-selected') === 'true') {
      expect(p.target.querySelector(`#${panelId}`)?.getAttribute('role')).toBe('tabpanel');
    }
  }
});

// The node menu opens from the keyboard too, not only with a right-click, and takes focus.
test('the node menu opens from the keyboard, takes focus, and gives it back', () => {
  const p = panel();
  p.emit({ ...treeMessage([node(1, 'Counter')]) });
  p.click('[data-select="Counter"]');
  const tree = p.target.querySelector('[role="tree"]') as HTMLElement;
  tree.focus();

  tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
  flushSync();
  const items = [...p.target.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
  expect(items.length).toBeGreaterThan(1);
  expect(document.activeElement).toBe(items.find((i) => !(i as HTMLButtonElement).disabled));

  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  flushSync();
  expect(document.activeElement).not.toBe(items[0]);
  expect(items).toContain(document.activeElement);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync();
  expect(p.target.querySelector('[role="menuitem"]')).toBeNull();
  expect(document.activeElement).toBe(tree);
});
