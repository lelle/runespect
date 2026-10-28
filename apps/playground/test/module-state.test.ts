import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { instrumentModule } from '@runespect/vite-plugin/internal';
import { parseAst } from 'vite';
import path from 'node:path';
import CartView from '../src/CartView.svelte';
import { add, getItems } from '../src/modules/cart.svelte';

// The playground's own directory, wherever the test runner was started from.
const PLAYGROUND = path.join(import.meta.dirname, '..');

// State declared in a .svelte.ts module, which no component holds as its own.
// The vitest config instruments src/modules/ the way runespect()
// does on the dev server.
beforeEach(() => {
  agent.activate();
  flushSync();
});

const moduleNode = () => agent.allNodes().find((n) => n.loc?.endsWith('modules/cart.svelte.ts'));

test('a module’s top-level state appears under "Modules", grouped like a component’s', () => {
  mount(CartView, { target: document.body.appendChild(document.createElement('div')) });
  flushSync();
  const node = moduleNode()!;
  expect(node.name).toBe('cart.svelte.ts');
  expect(agent.getNode(node.parent!)?.name).toBe('Modules');
  expect(node.kinds).toMatchObject({
    items: 'state',
    settings: 'state',
    count: 'derived',
    'coupon.code': 'class',
  });
  expect(node.values.settings).toEqual({ vat: true });
});

test('the values follow the module as it changes', () => {
  add('pear');
  flushSync();
  const node = moduleNode()!;
  expect(node.values.items).toContain('pear');
  expect(node.values.count).toBe(getItems().length);
});

test('a private `let` can be edited from the panel; the module sees the new value', () => {
  const node = moduleNode()!;
  expect(agent.setValue(node.id, 'items', ['fig'])).toBe(true);
  flushSync();
  expect(getItems()).toEqual(['fig']);
  expect(agent.isWritable(node.id, 'settings')).toBe(false); // exported: Svelte forbids reassigning it
});

const parse = parseAst;
const RUNE_CODE = 'let a = $state(1);';

test('modules in node_modules and SvelteKit’s generated code are left alone', () => {
  expect(instrumentModule(RUNE_CODE, '/app/node_modules/lib/x.svelte.js', parse)).toBeNull();
  expect(instrumentModule(RUNE_CODE, '/app/.svelte-kit/generated/x.svelte.js', parse)).toBeNull();
  expect(instrumentModule(RUNE_CODE, '/app/src/x.svelte.js', parse)).not.toBeNull();
});

test('a module without runes is left alone', () => {
  expect(instrumentModule('export const a = 1;', '/app/src/x.svelte.js', parse)).toBeNull();
});

// HMR runs the module again; its old node must not stay behind as a second, frozen copy.
test('a module that runs again replaces its node instead of adding a second one', () => {
  const first = agent.enterModule('/app/src/other.svelte.ts');
  const second = agent.enterModule('/app/src/other.svelte.ts');
  expect(agent.getNode(first)).toBeNull();
  expect(agent.allNodes().filter((n) => n.loc === '/app/src/other.svelte.ts')).toHaveLength(1);
  expect(agent.getNode(second)?.parent).toBe(moduleNode()!.parent);
});

// In a workspace or with linked packages, runespect's own modules sit outside node_modules too. The
// agent instrumenting itself would report its own bookkeeping as app state.
test('runespect’s own modules are left alone, wherever they are installed', () => {
  const agentModule = path.resolve(PLAYGROUND, '../../packages/agent/src/internal.svelte.ts');
  const appModule = path.resolve(PLAYGROUND, 'src/modules/cart.svelte.ts');
  expect(instrumentModule(RUNE_CODE, agentModule, parse)).toBeNull();
  expect(instrumentModule(RUNE_CODE, appModule, parse)).not.toBeNull();
});
