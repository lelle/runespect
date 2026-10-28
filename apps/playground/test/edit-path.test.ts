import { test, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { editMessage, applyOps } from '@runespect/agent/protocol/internal';
import Profile from '../src/Profile.svelte';
import { openPanel } from './helpers/agent';

let disconnect: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
});

// The panel holds a depth-1 copy of each value, with markers in place of nested objects, functions
// and class instances. An edit must therefore name the field it changes and leave the rest of the
// app's value alone.
function mountProfile() {
  const sent: any[] = [];
  let listener: ((msg: any) => void) | undefined;
  disconnect = agent.connect(
    openPanel({
      send: (m: any) => sent.push(m),
      onMessage: (cb: any) => ((listener = cb), () => (listener = undefined)),
    }),
  );
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Profile, { target });
  flushSync();

  let nodes: any[] = [];
  for (const m of sent) {
    if (m.kind === 'tree') nodes = m.nodes;
    else if (m.kind === 'ops') nodes = applyOps(nodes, m.ops);
  }
  const id = nodes.find((n) => n.name === 'Profile').id;
  const edit = (symbol: string, path: (string | number)[], value: unknown): void => {
    listener?.(editMessage(id, symbol, value, path));
    flushSync();
  };
  const text = (attr: string): string => target.querySelector(`[${attr}]`)!.textContent!.trim();
  return { edit, text };
}

test('editing one field leaves nested objects, functions and class instances in place', () => {
  const { edit, text } = mountProfile();
  edit('user', ['name'], 'grace');
  expect(text('data-user')).toBe('grace · paris · 49 · hi · t1');
});

test('a field deeper in the value can be edited', () => {
  const { edit, text } = mountProfile();
  edit('user', ['address', 'geo', 'lat'], 50);
  expect(text('data-user')).toBe('ada · paris · 50 · hi · t1');
});

test('an edit of $state.raw shows up, although raw state only reacts to reassignment', () => {
  const { edit, text } = mountProfile();
  edit('prefs', ['size'], 2);
  expect(text('data-prefs')).toBe('dark · 2');
});

test('an edit whose value carries a devtools marker is refused', () => {
  const { edit, text } = mountProfile();
  edit('user', ['address'], { __runespect: 'dehydrated', type: 'object', preview: '{}', size: 2 });
  edit('user', ['greet'], { __runespect: 'function', name: 'greet' });
  expect(text('data-user')).toBe('ada · paris · 49 · hi · t1');
});

test('an edit through something other than a plain object or array is refused', () => {
  const { edit, text } = mountProfile();
  edit('user', ['session', 'token'], 't2');
  expect(text('data-user')).toBe('ada · paris · 49 · hi · t1');
});
