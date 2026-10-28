import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { Inspect } from '@runespect/ui/internal';
import List from '../src/List.svelte';
import CardHost from '../src/CardHost.svelte';
import { svelteAtLeast } from './svelte-version';

beforeEach(() => {
  agent.reset();
  agent.activate();
});

function mountInto(Comp: any, props?: any) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Comp, { target, props });
  flushSync();
  return target;
}

test('declared {#snippet} blocks are recorded on the node', () => {
  mountInto(List, { items: ['a', 'b'] });
  const list = agent.allNodes().find((n) => n.name === 'List')!;
  expect(list.snippets).toContain('row');
});

test('a received snippet prop is reported as a non-editable function', () => {
  mountInto(CardHost);
  const card = agent.allNodes().find((n) => n.name === 'Card')!;
  expect(typeof agent.read(card.id, 'children')).toBe('function');
  expect(agent.isWritable(card.id, 'children')).toBe(false);
  expect(agent.read(card.id, 'title')).toBe('hi');
});

// In dev Svelte hands a snippet prop over as a function named `snippet`, so a snippet still reads as
// one, while a callback prop shows its own name. Before 5.27.1 the function has no name.
test('overlay lists declared snippets and renders a snippet prop as a function', () => {
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);

  mount(List, { target: document.createElement('div'), props: { items: ['a'] } });
  mount(CardHost, { target: document.createElement('div') });
  mount(Inspect, { target: overlay });
  flushSync();
  const shadow = overlay.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;

  expect(shadow.querySelector('[data-snippet="List.row"]')).toBeTruthy();

  const children = shadow.querySelector('[data-value="Card.children"]')!;
  expect(children).toBeTruthy();
  expect(children.textContent!.trim()).toBe(svelteAtLeast('5.27.1') ? 'ƒ snippet' : 'ƒ');
  expect(shadow.querySelector('[data-edit="Card.children"]')).toBeNull();
});
