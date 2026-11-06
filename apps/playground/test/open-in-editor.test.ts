import { test, expect, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree, editorUrl } from '@runespect/ui/internal';
import {
  PROTOCOL_VERSION,
  helloMessage,
  treeMessage,
  type Message,
} from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

// Pure editor-URL builder.
test('editorUrl: file:line fills the default vscode template', () => {
  expect(editorUrl('/src/Counter.svelte:9')).toBe('vscode://file//src/Counter.svelte:9');
});

test('editorUrl: a bare file path defaults to line 1', () => {
  expect(editorUrl('/src/Counter.svelte')).toBe('vscode://file//src/Counter.svelte:1');
});

test('editorUrl: honours a custom template', () => {
  expect(editorUrl('/a/B.svelte:3', '{file}#{line}')).toBe('/a/B.svelte#3');
});

// <Tree> renders the component name as an editor link when loc is present.
function mountTree(nodes: any) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes } });
  flushSync();
  return target;
}

// By default the link goes through the dev server, which opens the editor LAUNCH_EDITOR names.
test('Tree: component name opens through the dev server when loc is present', () => {
  const target = mountTree([
    {
      id: 1,
      name: 'Counter',
      parent: null,
      children: [],
      values: {},
      snippets: [],
      writable: [],
      loc: '/src/Counter.svelte:9',
    },
  ]);
  const link = target.querySelector('a[data-open="Counter"]') as HTMLAnchorElement;
  expect(link).toBeTruthy();
  expect(link.getAttribute('href')).toBe('/__open-in-editor?file=%2Fsrc%2FCounter.svelte%3A9');
});

const counter = {
  id: 1,
  name: 'Counter',
  parent: null,
  children: [],
  values: {},
  snippets: [],
  writable: [],
  loc: '/src/Counter.svelte:9',
};

test('Tree: a click asks to open the file, and does not follow the link', () => {
  const onOpen = vi.fn();
  const target = document.body.appendChild(document.createElement('div'));
  mount(Tree, { target, props: { nodes: [counter], onOpen } });
  flushSync();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  (target.querySelector('a[data-open="Counter"]') as HTMLElement).dispatchEvent(click);

  expect(onOpen).toHaveBeenCalledWith('/src/Counter.svelte:9');
  expect(click.defaultPrevented).toBe(true);
});

test("Tree: with openInEditor 'vscode' the name is a vscode:// link", () => {
  const onOpen = vi.fn();
  const target = document.body.appendChild(document.createElement('div'));
  mount(Tree, { target, props: { nodes: [counter], openInEditor: 'vscode', onOpen } });
  flushSync();
  const link = target.querySelector('a[data-open="Counter"]') as HTMLAnchorElement;
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(link.getAttribute('href')).toBe('vscode://file//src/Counter.svelte:9');
  expect(onOpen).not.toHaveBeenCalled();
});

test('Tree: name is plain text when Open in editor is off', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const node = {
    id: 1,
    name: 'Counter',
    parent: null,
    children: [],
    values: {},
    snippets: [],
    writable: [],
    loc: '/src/Counter.svelte:9',
  };
  mount(Tree, { target, props: { nodes: [node], openInEditor: false } });
  flushSync();
  expect(target.querySelector('a[data-open="Counter"]')).toBeNull();
  expect(target.querySelector('[data-component="Counter"] .name')).toBeTruthy();
});

test('Tree: name is plain text (no link) when loc is absent', () => {
  const target = mountTree([
    { id: 1, name: 'Bare', parent: null, children: [], values: {}, snippets: [], writable: [] },
  ]);
  expect(target.querySelector('a[data-open="Bare"]')).toBeNull();
  expect(target.querySelector('[data-component="Bare"] .name')).toBeTruthy();
});

// <Panel> drops Open in editor when the page it follows says it is off: no menu item and no
// </> in the detail pane. Pick and highlight still use loc, so it stays.
const cart = {
  id: 1,
  name: 'Cart',
  parent: null,
  children: [],
  values: {},
  snippets: [],
  writable: [],
  loc: 'src/Cart.svelte:4',
};

function panelAfter(hello: Message) {
  const panel = mountPanel();
  panel.emit(hello);
  panel.emit(treeMessage([cart]));
  panel.click('[data-select="Cart"]');
  const row = panel.target.querySelector('[data-select="Cart"]') as HTMLElement;
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
  flushSync();
  const menu = [...panel.target.querySelectorAll('[role="menuitem"]')].map((el) =>
    el.textContent?.trim(),
  );
  return { menu, sourceLink: panel.target.querySelector('[data-detail-source]') };
}

test('Panel: Open in editor is offered when the page does not say otherwise', () => {
  const { menu, sourceLink } = panelAfter(helloMessage(PROTOCOL_VERSION, 0));
  expect(menu).toContain('Open in editor');
  expect(sourceLink).toBeTruthy();
});

test('Panel: Open in editor is gone when the page turned it off', () => {
  const { menu, sourceLink } = panelAfter({
    ...helloMessage(PROTOCOL_VERSION, 0),
    openInEditor: false,
  });
  expect(menu).not.toContain('Open in editor');
  expect(menu).toContain('Highlight in page');
  expect(sourceLink).toBeNull();
});

// Names only sends no hello, and __svelte_meta gives a path relative to a project root the panel
// cannot know, so a link would open nothing.
test('Panel: Open in editor is gone in Names only', () => {
  const panel = mountPanel();
  panel.emit(treeMessage([cart]));
  panel.click('[data-select="Cart"]');
  const row = panel.target.querySelector('[data-select="Cart"]') as HTMLElement;
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
  flushSync();
  const menu = [...panel.target.querySelectorAll('[role="menuitem"]')].map((el) =>
    el.textContent?.trim(),
  );
  expect(menu).not.toContain('Open in editor');
  expect(panel.target.querySelector('[data-detail-source]')).toBeNull();
});

// The panel cannot reach the dev server from the extension, so it asks the page, which calls its
// own. launch-editor reports a failure only in the terminal, so the panel says where to look.
function followed(hello: Message = { ...helloMessage(PROTOCOL_VERSION, 0), from: 'p1' }) {
  const panel = mountPanel();
  panel.emit(hello);
  panel.emit({ ...treeMessage([cart]), from: 'p1' } as Message);
  panel.click('[data-select="Cart"]');
  return panel;
}
const notice = (t: HTMLElement) => t.querySelector('[data-testid="runespect-notice"]')?.textContent;

test('Panel: Open in editor asks the page to open the file, and says where to look if nothing does', () => {
  vi.useFakeTimers();
  try {
    const panel = followed();
    const before = panel.sent.length;
    panel.click('[data-detail-source]');

    expect(panel.sent.slice(before)).toEqual([
      expect.objectContaining({ kind: 'open-in-editor', loc: 'src/Cart.svelte:4', to: 'p1' }),
    ]);
    expect(notice(panel.target)).toContain('Opening Cart.svelte:4 in your editor');
    expect(notice(panel.target)).toContain("See the dev server's terminal");

    vi.advanceTimersByTime(3000);
    flushSync();
    expect(notice(panel.target)).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

test('Panel: a dev server the page could not reach is said so', () => {
  const panel = followed();
  panel.click('[data-detail-source]');
  panel.emit({
    source: 'runespect',
    kind: 'opened',
    loc: 'src/Cart.svelte:4',
    ok: false,
    from: 'p1',
  } as Message);

  expect(notice(panel.target)).toContain('Could not reach the dev server to open the editor');
});

test('Panel: a page that asks for vscode:// links gets them, and nothing is sent', () => {
  const panel = followed({
    ...helloMessage(PROTOCOL_VERSION, 0),
    openInEditor: 'vscode',
    from: 'p1',
  });
  const link = panel.target.querySelector('[data-detail-source]') as HTMLAnchorElement;
  const before = panel.sent.length;
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  flushSync();

  expect(link.getAttribute('href')).toBe('vscode://file/src/Cart.svelte:4');
  expect(panel.sent.slice(before)).toEqual([]);
  expect(notice(panel.target)).toBeUndefined();
});
