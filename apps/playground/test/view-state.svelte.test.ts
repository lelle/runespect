import { test, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { Theme, Search, Preferences } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

// The view state the panel and the overlay share, tested without mounting either. Each class
// persists from an $effect, so it is made inside an effect root, as a component would make it.

let stops: (() => void)[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
});

function make<T>(create: () => T): T {
  let made!: T;
  stops.push($effect.root(() => void (made = create())));
  flushSync();
  return made;
}

const node = (id: number, name: string): SerializedNode => ({
  id,
  name,
  parent: null,
  children: [],
  snippets: [],
  values: {},
  writable: [],
});

function search(names: string[]) {
  let nodes = $state(names.map((name, i) => node(i + 1, name)));
  const selected: number[] = [];
  const s = make(
    () =>
      new Search(
        () => nodes,
        (id) => selected.push(id),
      ),
  );
  return {
    s,
    selected,
    setNodes: (next: string[]) => (nodes = next.map((name, i) => node(i + 1, name))),
  };
}

const enter = (shiftKey = false) => new KeyboardEvent('keydown', { key: 'Enter', shiftKey });

test('a new query selects its first match', () => {
  const { s, selected } = search(['App', 'Row', 'List', 'Row']);
  s.set('row');

  expect(s.query).toBe('row');
  expect(s.status).toBe('1 of 2');
  expect(selected).toEqual([2]);
});

test('Enter moves to the next match and Shift+Enter to the previous, wrapping both ways', () => {
  const { s, selected } = search(['Row', 'App', 'Row', 'Row']);
  s.set('row');
  s.key(enter());
  s.key(enter());
  expect(s.status).toBe('3 of 3');
  s.key(enter());
  expect(s.status).toBe('1 of 3');
  s.key(enter(true));
  expect(s.status).toBe('3 of 3');

  expect(selected).toEqual([1, 3, 4, 1, 4]);
});

test('a key other than Enter leaves the search and the page alone', () => {
  const { s, selected } = search(['Row', 'Row']);
  s.set('row');
  const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
  s.key(tab);

  expect(s.status).toBe('1 of 2');
  expect(selected).toEqual([1]);
  expect(tab.defaultPrevented).toBe(false);
});

test('Enter with no match leaves the page alone', () => {
  const { s, selected } = search(['App']);
  s.set('row');
  const e = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  s.key(e);

  expect(s.status).toBe('0 of 0');
  expect(selected).toEqual([]);
  expect(e.defaultPrevented).toBe(false);
});

test('Enter on a match is kept from the page', () => {
  const { s } = search(['Row']);
  s.set('row');
  const e = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  s.key(e);

  expect(e.defaultPrevented).toBe(true);
});

test('a new query starts again from its first match', () => {
  const { s, selected } = search(['Row', 'Row', 'List']);
  s.set('row');
  s.key(enter());
  s.set('ro');

  expect(s.status).toBe('1 of 2');
  expect(selected).toEqual([1, 2, 1]);
});

test('an invalid regex says so, and an empty query says nothing', () => {
  const { s } = search(['Row']);
  s.set('/[/');
  expect(s.status).toBe('bad regex');

  s.set('  ');
  expect(s.status).toBe('');
});

test('the count follows the tree as it changes', () => {
  const { s, setNodes } = search(['Row']);
  s.set('row');
  setNodes(['Row', 'Row', 'Row']);

  expect(s.status).toBe('1 of 3');
});

function fakeMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    change(next: boolean) {
      this.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}
const theme = (media: ReturnType<typeof fakeMedia> | null) =>
  make(() => new Theme({ media: media as unknown as MediaQueryList | null }));

test("'auto' follows the system as it changes", () => {
  const media = fakeMedia(false);
  const t = theme(media);
  expect([t.setting, t.resolved]).toEqual(['auto', 'light']);

  media.change(true);
  expect(t.resolved).toBe('dark');
});

test("'auto' on a dark system starts dark", () => {
  expect(theme(fakeMedia(true)).resolved).toBe('dark');
});

test('an explicit theme ignores the system', () => {
  const media = fakeMedia(true);
  const t = theme(media);
  t.setting = 'light';
  media.change(true);

  expect(t.resolved).toBe('light');
});

test('without a way to ask the system, auto is light', () => {
  expect(theme(null).resolved).toBe('light');
});

test('the theme survives a new view', () => {
  const t = theme(null);
  t.setting = 'dark';
  flushSync();

  expect(theme(null).setting).toBe('dark');
});

test('the theme stops listening to the system when its view goes', () => {
  const media = fakeMedia(false);
  const t = theme(media);
  stops.pop()!();
  media.change(true);

  expect(t.resolved).toBe('light');
});

test('preferences start as flash on, values collapsed, every component shown', () => {
  const p = make(() => new Preferences());

  expect([p.flash, p.expandValues, p.onlyStateful]).toEqual([true, false, false]);
});

// The panel and the overlay read the same keys, so a choice in one is there in the other.
test('each preference survives a new view', () => {
  const p = make(() => new Preferences());
  p.flash = false;
  p.expandValues = true;
  p.onlyStateful = true;
  flushSync();

  const next = make(() => new Preferences());
  expect([next.flash, next.expandValues, next.onlyStateful]).toEqual([false, true, true]);
});
