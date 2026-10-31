import { test, expect } from 'vitest';
import { componentsFromSvelteMeta } from '../../../packages/extension/src/dom-walk';
import { startTier1 } from '../../../packages/extension/src/content-tier1';

const withMeta = (tag: string, file: string, line: number): HTMLElement => {
  const el = document.createElement(tag);
  (el as any).__svelte_meta = { loc: { file, line, column: 0 } };
  return el;
};

test('names-only DOM walk lists distinct components + source locations from __svelte_meta', () => {
  const root = document.createElement('div');
  const h1 = withMeta('h1', 'src/App.svelte', 5);
  const btn1 = withMeta('button', 'src/Counter.svelte', 9);
  const btn2 = withMeta('button', 'src/Counter.svelte', 9); // second Counter instance, same file
  root.append(h1, btn1, btn2);

  const nodes = componentsFromSvelteMeta(root);

  const names = nodes.map((n) => n.name).sort();
  expect(names).toEqual(['App', 'Counter']); // distinct files, deduped
  const counter = nodes.find((n) => n.name === 'Counter')!;
  expect(counter.loc).toBe('src/Counter.svelte:9');
  // honest limits: no state, no reliable tree
  expect(counter.values).toEqual({});
  expect(counter.parent).toBeNull();
});

test('builds a nested tree from DOM containment (parent component encloses child)', () => {
  const root = document.createElement('div');
  const app = withMeta('div', 'src/App.svelte', 1);
  const header = withMeta('header', 'src/Header.svelte', 3);
  const counter = withMeta('button', 'src/Counter.svelte', 9);
  app.append(header, counter); // App renders Header + Counter
  root.append(app);

  const nodes = componentsFromSvelteMeta(root);
  const byName = (n: string) => nodes.find((x) => x.name === n)!;

  expect(byName('App').parent).toBeNull();
  expect(byName('Header').parent).toBe(byName('App').id);
  expect(byName('Counter').parent).toBe(byName('App').id);
  expect(byName('App').children).toEqual([byName('Header').id, byName('Counter').id]);
});

test('a shared child component is expanded under each parent (graph → tree)', () => {
  const root = document.createElement('div');
  const a = withMeta('div', 'src/A.svelte', 1);
  const b = withMeta('div', 'src/B.svelte', 1);
  const iconInA = withMeta('svg', 'src/Icon.svelte', 1);
  const iconInB = withMeta('svg', 'src/Icon.svelte', 1);
  a.append(iconInA);
  b.append(iconInB);
  root.append(a, b);

  const icons = componentsFromSvelteMeta(root).filter((n) => n.name === 'Icon');
  expect(icons).toHaveLength(2); // one under A, one under B
});

test('elements without __svelte_meta (production / non-Svelte) yield nothing', () => {
  const root = document.createElement('div');
  root.append(document.createElement('span'), document.createElement('p'));
  expect(componentsFromSvelteMeta(root)).toEqual([]);
});

test('startTier1 posts a tree message of the DOM-derived components', async () => {
  document.body.innerHTML = '';
  document.body.append(withMeta('button', 'src/Counter.svelte', 9));

  const got: any[] = [];
  const handler = (e: MessageEvent) => {
    if (e.data?.source === 'runespect') got.push(e.data);
  };
  window.addEventListener('message', handler);

  const stop = startTier1(window);
  await new Promise((r) => setTimeout(r, 0)); // window 'message' is async

  const tree = got.find((m) => m.kind === 'tree');
  expect(tree).toBeTruthy();
  expect(tree.nodes.map((n: any) => n.name)).toContain('Counter');

  stop();
  window.removeEventListener('message', handler);
});

// Markup a parent passes as a snippet sits inside the child that renders it, so the parent's file is
// inside the child's and the child's inside the parent's. Every file is then someone's child.
function snippetPage(): HTMLElement {
  const tagged = (tag: string, file: string, ...children: Element[]): HTMLElement => {
    const el = document.createElement(tag);
    (el as any).__svelte_meta = { loc: { file, line: 1 } };
    el.append(...children);
    return el;
  };
  const root = document.createElement('div');
  root.append(
    tagged(
      'section',
      'src/App.svelte',
      tagged('div', 'src/Card.svelte', tagged('p', 'src/App.svelte')),
    ),
  );
  return root;
}

test('a snippet passed to a child does not leave the tree without a root', () => {
  const nodes = componentsFromSvelteMeta(snippetPage());

  expect(nodes.map((n) => n.name)).toEqual(['App', 'Card']);
  expect(nodes[0].parent).toBeNull();
  expect(nodes[1].parent).toBe(nodes[0].id);
});
