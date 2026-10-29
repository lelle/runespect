import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import RowList from '../src/RowList.svelte';
import CardHost from '../src/CardHost.svelte';
import { Inspect } from '@runespect/ui/internal';
import { instrumented } from './helpers/instrumented';

// Row has no single outer element: its name and its button sit side by side. Each instance in the
// list must still map to its own elements, not to the first instance's, and keep doing so when rows
// leave the list and come back in another order than the one they were made in.
let app: Record<string, unknown> | undefined;
const props = $state({ filter: '' });
beforeEach(() => {
  agent.reset();
  agent.activate();
  props.filter = '';
  app = mount(RowList, { target: document.body.appendChild(document.createElement('div')), props });
  flushSync();
});
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = '';
});

const rows = () => agent.allNodes().filter((n) => n.name === 'Row');
const nameOf = (id: number) => agent.allNodes().find((n) => n.id === id)?.values.name;
const shownFor = (id: number) =>
  agent
    .elementForNode(
      agent.allNodes().find((n) => n.id === id),
      agent.allNodes(),
    )
    ?.closest('li')
    ?.querySelector('.name')?.textContent;

test('each instance of a component with several top-level elements maps to its own element', () => {
  expect(rows().map((row) => shownFor(row.id))).toEqual(['Apple', 'Bread', 'Coffee']);
});

test('a click inside the third instance picks the third node', () => {
  const name = document.querySelectorAll('li')[2].querySelector('b')!;

  expect(agent.nodeIdForElement(name, agent.allNodes())).toBe(rows()[2].id);
});

test('rows that leave the list and come back still map to their own elements', () => {
  props.filter = 'cof';
  flushSync();
  props.filter = '';
  flushSync();

  expect(rows().map((row) => [nameOf(row.id), shownFor(row.id)])).toEqual(
    rows().map((row) => [nameOf(row.id), nameOf(row.id)]),
  );
  const buttons = [...document.querySelectorAll('button')];
  expect(buttons.map((b) => nameOf(agent.nodeIdForElement(b, agent.allNodes())!))).toEqual([
    'Apple',
    'Bread',
    'Coffee',
  ]);
});

test("an element in <svelte:head> is not the component's element", async () => {
  const c = await instrumented(
    `<svelte:head><meta name="x" content="y" /></svelte:head><p class="body">body</p>`,
  );

  expect(agent.elementForNode(c.node, agent.allNodes())?.className).toBe('body');
  c.unmount();
});

test('what a component passes to a child is its own, wherever the child renders it', () => {
  const target = document.body.appendChild(document.createElement('div'));
  const host = mount(CardHost, { target });
  flushSync();
  const [hostNode, card] = ['CardHost', 'Card'].map((name) =>
    agent.allNodes().find((n) => n.name === name)!,
  );

  expect(agent.nodeIdForElement(target.querySelector('p'), agent.allNodes())).toBe(hostNode.id);
  expect(agent.nodeIdForElement(target.querySelector('h3'), agent.allNodes())).toBe(card.id);
  expect(agent.elementForNode(hostNode, agent.allNodes())?.tagName).toBe('P');
  expect(agent.elementForNode(card, agent.allNodes())?.tagName).toBe('SECTION');
  unmount(host);
});

test('an element a block shows later belongs to its instance', async () => {
  const c = await instrumented(
    `<script>let open = $state(false);</script>
{#if open}<p class="late">later</p>{/if}
<button onclick={() => (open = true)}>open</button>`,
  );
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'open')!.click();
  flushSync();

  expect(agent.nodeIdForElement(document.querySelector('.late'), agent.allNodes())).toBe(c.node.id);
  expect(agent.elementForNode(c.node, agent.allNodes())?.className).toBe('late');
  c.unmount();
});

// jsdom has no layout: the second row's name and button get rectangles side by side.
function layOutSecondRow(): void {
  const li = document.querySelectorAll('li')[1];
  const rect = (left: number, width: number) => () =>
    ({ top: 50, left, width, height: 20, right: left + width, bottom: 70 }) as DOMRect;
  li.querySelector('.name')!.getBoundingClientRect = rect(10, 60);
  li.querySelector('button')!.getBoundingClientRect = rect(80, 40);
}

const boxOf = (box: HTMLElement) =>
  [box.style.left, box.style.top, box.style.width, box.style.height].join(' ');

test('the highlight covers every element of the instance, not only its first', () => {
  layOutSecondRow();

  agent.highlight(rows()[1].id);

  expect(boxOf(document.querySelector('[data-runespect-highlight]') as HTMLElement)).toBe(
    '10px 50px 110px 20px',
  );
});

test("the overlay's highlight covers every element of the instance too", () => {
  layOutSecondRow();
  const target = document.body.appendChild(document.createElement('div'));
  mount(Inspect, { target });
  flushSync();
  const overlay = target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;

  overlay
    .querySelectorAll('[data-component="Row"] > .name')[1]
    .dispatchEvent(new MouseEvent('mouseenter'));
  flushSync();

  expect(boxOf(overlay.querySelector('[data-testid="runespect-highlight"]') as HTMLElement)).toBe(
    '10px 50px 110px 20px',
  );
});

const pageBox = () => document.querySelector('[data-runespect-highlight]') as HTMLElement;

test('while picking, the box covers the instance a click picks, named', () => {
  layOutSecondRow();
  agent.startPick(() => {});

  document
    .querySelectorAll('li')[1]
    .querySelector('b')!
    .dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

  expect(boxOf(pageBox())).toBe('10px 50px 110px 20px');
  expect(pageBox().textContent).toBe('Row');
});

// A library's component is compiled by Svelte too, so its elements are tagged, but nothing
// instrumented renders them: a click there picks nothing.
test('while picking, an element no instance owns gets no box', () => {
  agent.startPick(() => {});
  const library = document.body.appendChild(document.createElement('p'));
  (library as unknown as { __svelte_meta: unknown }).__svelte_meta = {
    loc: { file: 'node_modules/lib/Widget.svelte' },
  };

  document
    .querySelectorAll('li')[1]
    .querySelector('b')!
    .dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  library.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

  expect(pageBox().style.display).toBe('none');
});

test('the highlight from the tree is named too', () => {
  agent.highlight(rows()[1].id);

  expect(pageBox().textContent).toBe('Row');
});

test('while picking in the overlay, the box covers the instance a click picks, named', () => {
  layOutSecondRow();
  const target = document.body.appendChild(document.createElement('div'));
  mount(Inspect, { target });
  flushSync();
  const overlay = target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;
  const pick = overlay.querySelector('[data-testid="runespect-pick"]') as HTMLButtonElement;
  pick.click();
  flushSync();

  document
    .querySelectorAll('li')[1]
    .querySelector('b')!
    .dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  flushSync();

  const highlight = overlay.querySelector('[data-testid="runespect-highlight"]') as HTMLElement;
  expect(boxOf(highlight)).toBe('10px 50px 110px 20px');
  expect(highlight.textContent).toBe('Row');
  pick.click();
});
