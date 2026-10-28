import { test, expect, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Tree, ROW_HEIGHT } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

// One root with 200 children: a large tree.
const CHILDREN = 200;
const bigTree: SerializedNode[] = [
  {
    id: 1,
    name: 'App',
    parent: null,
    children: Array.from({ length: CHILDREN }, (_, i) => i + 2),
    snippets: [],
    values: {},
    writable: [],
  },
  ...Array.from({ length: CHILDREN }, (_, i) => ({
    id: i + 2,
    name: `Row${i}`,
    parent: 1,
    children: [] as number[],
    snippets: [],
    values: {},
    writable: [],
  })),
];

const VIEWPORT_HEIGHT = 200; // 10 rows tall
const origHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
function stubViewportHeight(px: number): void {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: px });
}
afterEach(() => {
  // clientHeight lives on Element.prototype, so there is usually nothing to restore — the stub has
  // to be deleted or it leaks into the tests that rely on an unmeasured viewport.
  if (origHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

function mountTree(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Tree, { target, props: { nodes: bigTree, namesOnly: true, ...props } });
  flushSync();
  return target;
}

const rowNames = (target: HTMLElement): string[] =>
  [...target.querySelectorAll('[data-component]')].map((el) => el.getAttribute('data-component')!);
const viewportOf = (target: HTMLElement): HTMLElement =>
  target.querySelector('[data-testid="runespect-tree-viewport"]') as HTMLElement;
const padHeight = (target: HTMLElement, which: string): number =>
  parseInt((target.querySelector(`.rs-pad-${which}`) as HTMLElement).style.height, 10);

test('a measured viewport renders only the rows in view (plus overscan), not the whole tree', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({});

  const names = rowNames(target);
  expect(names.length).toBeGreaterThan(VIEWPORT_HEIGHT / ROW_HEIGHT); // the viewport is filled
  expect(names.length).toBeLessThan(CHILDREN / 2); // …but nowhere near all 201 rows
  expect(names[0]).toBe('App'); // window starts at the top
});

test('spacers stand in for the unrendered rows so the scrollbar spans the whole tree', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({});

  const rendered = rowNames(target).length;
  const total = padHeight(target, 'top') + rendered * ROW_HEIGHT + padHeight(target, 'bottom');
  expect(total).toBe((CHILDREN + 1) * ROW_HEIGHT);
});

test('scrolling renders the rows at the new offset and drops the ones scrolled past', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({});
  const viewport = viewportOf(target);

  viewport.scrollTop = 100 * ROW_HEIGHT;
  viewport.dispatchEvent(new Event('scroll'));
  flushSync();

  const names = rowNames(target);
  expect(names).toContain('Row99'); // row index 100 (App is index 0)
  expect(names).not.toContain('App'); // scrolled out of the window
  expect(padHeight(target, 'top')).toBeGreaterThan(0);
});

test('an unmeasured viewport (no layout yet) renders every row rather than none', () => {
  const target = mountTree({}); // clientHeight is 0 in jsdom unless stubbed
  expect(rowNames(target)).toHaveLength(CHILDREN + 1);
});

test('selecting a row outside the window scrolls it into view so it renders', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({ selectedId: 150 }); // deep down the list

  expect(viewportOf(target).scrollTop).toBeGreaterThan(0);
  expect(rowNames(target)).toContain('Row148');
  expect(target.querySelector('.rs-selected')).toBeTruthy();
});

test('scrolling away from the selected row does not snap the view back to it', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({ selectedId: 2 }); // Row0, at the top
  const viewport = viewportOf(target);

  viewport.scrollTop = 100 * ROW_HEIGHT;
  viewport.dispatchEvent(new Event('scroll'));
  flushSync();

  expect(viewport.scrollTop).toBe(100 * ROW_HEIGHT); // the selection must not pull it back
  expect(rowNames(target)).toContain('Row99');
});

test('rows carry their nesting depth as an indent and an aria level', () => {
  stubViewportHeight(VIEWPORT_HEIGHT);
  const target = mountTree({});
  const app = target.querySelector('[data-component="App"]') as HTMLElement;
  const child = target.querySelector('[data-component="Row0"]') as HTMLElement;

  expect(app.getAttribute('aria-level')).toBe('1');
  expect(child.getAttribute('aria-level')).toBe('2');
  expect(parseInt(child.style.paddingLeft, 10)).toBeGreaterThan(
    parseInt(app.style.paddingLeft, 10),
  );
});
