import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import StatelessHost from '../src/StatelessHost.svelte';
import { Inspect } from '@runespect/ui/internal';

// StatelessHost renders Static and Bare and no element of its own. Its highlight is one dashed box
// around what its children render, named so it does not look like an element it owns.
let app: Record<string, unknown> | undefined;
beforeEach(() => {
  agent.reset();
  agent.activate();
  app = mount(StatelessHost, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  layOut();
});
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = '';
});

// jsdom has no layout: Static's div above Bare's p.
function layOut(): void {
  const rect = (top: number, width: number) => () =>
    ({ top, left: 10, width, height: 20, right: 10 + width, bottom: top + 20 }) as DOMRect;
  document.querySelector('div > div')!.getBoundingClientRect = rect(50, 200);
  document.querySelector('p')!.getBoundingClientRect = rect(80, 100);
}

const nodeNamed = (name: string) => agent.allNodes().find((n) => n.name === name)!;
const pageBox = () => document.querySelector('[data-runespect-highlight]') as HTMLElement;
const boxOf = (box: HTMLElement) =>
  [box.style.left, box.style.top, box.style.width, box.style.height].join(' ');

test('a component with no element of its own is boxed around its children, dashed and named so', () => {
  agent.highlight(nodeNamed('StatelessHost').id);

  expect(boxOf(pageBox())).toBe('10px 50px 200px 50px');
  expect(pageBox().style.outlineStyle).toBe('dashed');
  expect(pageBox().textContent).toBe('StatelessHost (via children)');
});

test('a component with an element of its own keeps the solid box and its plain name', () => {
  agent.highlight(nodeNamed('StatelessHost').id);
  agent.highlight(nodeNamed('Bare').id);

  expect(boxOf(pageBox())).toBe('10px 80px 100px 20px');
  expect(pageBox().style.outlineStyle).toBe('solid');
  expect(pageBox().textContent).toBe('Bare');
});

test('a component whose children render nothing either gets no box', () => {
  const empty = agent.enter('Empty');
  agent.enter('Nothing', empty);

  agent.highlight(empty);

  expect(pageBox()?.style.display ?? 'none').toBe('none');
});

// An app that replaces document.body takes the box with it; the one drawn again on the next scroll
// keeps what it said.
test('a box drawn again after the page dropped it is still dashed and named', () => {
  agent.highlight(nodeNamed('StatelessHost').id);
  pageBox().remove();

  window.dispatchEvent(new Event('scroll'));

  expect(pageBox().style.outlineStyle).toBe('dashed');
  expect(pageBox().textContent).toBe('StatelessHost (via children)');
});

test("the overlay's highlight boxes a component with no element of its own the same way", () => {
  const target = document.body.appendChild(document.createElement('section'));
  const inspect = mount(Inspect, { target });
  flushSync();
  const overlay = target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;

  overlay
    .querySelector('[data-component="StatelessHost"] > .name')!
    .dispatchEvent(new MouseEvent('mouseenter'));
  flushSync();

  const highlight = overlay.querySelector('[data-testid="runespect-highlight"]') as HTMLElement;
  expect(boxOf(highlight)).toBe('10px 50px 200px 50px');
  expect(highlight.classList.contains('via-children')).toBe(true);
  expect(highlight.textContent).toBe('StatelessHost (via children)');
  unmount(inspect);
});
