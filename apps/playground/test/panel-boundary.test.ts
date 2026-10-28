import { test, expect } from 'vitest';
import { flushSync } from 'svelte';
import { treeMessage, type SerializedNode } from '@runespect/agent/protocol/internal';
import { mountPanel, node } from './helpers/panel';
import { svelteAtLeast } from './svelte-version';

// A value the panel cannot render (here a Map with no entries, as an agent on another protocol
// version could send) must not take the whole panel down with it, the tree included.
const BROKEN = { __runespect: 'map' };
// Before 5.37.1 the boundary reports the error, but the panel around it still goes down.
const recovers = test.skipIf(!svelteAtLeast('5.37.1'));

function panel(onError?: (where: string, error: unknown) => void) {
  const p = mountPanel({ onError });
  return {
    target: p.target,
    tree: (nodes: SerializedNode[]) => p.emit(treeMessage(nodes)),
    select: (name: string) => p.click(`[data-select="${name}"]`),
  };
}

recovers(
  'a value the detail pane cannot render shows an error there, and the tree keeps working',
  () => {
    const errors: string[] = [];
    const p = panel((where) => errors.push(where));
    p.tree([node(1, 'Broken', { m: BROKEN }), node(2, 'Fine', { count: 3 })]);

    p.select('Broken');
    expect(p.target.querySelector('[data-pane-error="detail"]')).not.toBeNull();
    expect(errors).toEqual(['detail']);

    p.select('Fine');
    expect(p.target.querySelector('[data-select="Fine"]')).not.toBeNull();
  },
);

recovers('"Try again" renders the pane anew once the value is fixed', () => {
  const p = panel();
  p.tree([node(1, 'C', { m: BROKEN })]);
  p.select('C');
  expect(p.target.querySelector('[data-pane-error="detail"]')).not.toBeNull();

  p.tree([node(1, 'C', { m: { __runespect: 'map', entries: [] } })]);
  (p.target.querySelector('[data-pane-retry="detail"]') as HTMLButtonElement).click();
  flushSync();
  expect(p.target.querySelector('[data-pane-error="detail"]')).toBeNull();
  expect(p.target.querySelector('[data-detail-value="C.m"]')?.textContent).toContain('Map(0)');
});
