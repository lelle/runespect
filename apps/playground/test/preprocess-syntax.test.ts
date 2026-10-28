import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { runespectPreprocess } from '@runespect/vite-plugin';
import { componentName } from '@runespect/agent/protocol/internal';
import TsRunes from '../src/syntax/TsRunes.svelte';
import PropsBag from '../src/syntax/PropsBag.svelte';

// What the agent hears from components written in less common syntax: casts, satisfies,
// destructuring, quoted class fields and a props object.
beforeEach(() => {
  agent.reset();
  agent.activate();
});

const kindsOf = (component: any, props: Record<string, unknown> = {}) => {
  mount(component, { target: document.body.appendChild(document.createElement('div')), props });
  flushSync();
  return agent.allNodes().at(-1)!.kinds;
};

test('state behind a TypeScript `!`, `as` or `satisfies` is reported', () => {
  expect(kindsOf(TsRunes)).toMatchObject({ el: 'state', n: 'state', cfg: 'state' });
});

test('$state.snapshot() is a plain copy, not state', () => {
  expect(kindsOf(TsRunes)).not.toHaveProperty('copy');
});

test('a destructured $derived reports each name', () => {
  expect(kindsOf(TsRunes)).toMatchObject({ first: 'derived', second: 'derived' });
});

test('`let props = $props()` is reported as one value', () => {
  const kinds = kindsOf(PropsBag, { label: 'hi' });
  expect(kinds).toMatchObject({ props: 'prop' });
  expect(agent.allNodes().at(-1)!.values.props).toEqual({ label: 'hi' });
});

test('a class field with a string-literal key is skipped, not reported as `undefined`', () => {
  const kinds = kindsOf(TsRunes)!;
  expect(kinds['b.c']).toBe('class');
  expect(Object.keys(kinds).some((k) => k.includes('undefined'))).toBe(false);
});

test('a <style lang="scss"> before vitePreprocess does not stop the instrumentation', () => {
  const content = `<script>\n  let n = $state(0);\n</script>\n<p>{n}</p>\n<style lang="scss">\n  // a comment\n  $x: red;\n  p { a { color: $x; } }\n</style>`;
  const out = runespectPreprocess({ enabled: true }).markup({ content, filename: 'S.svelte' });
  expect(out?.code).toContain('__runespect.component(');
  expect(out?.code).toContain('$x: red;'); // the style itself is left as it was
});

test('SvelteKit route files are named with their route', () => {
  expect(componentName('/app/src/routes/blog/[slug]/+page.svelte')).toBe('+page (blog/[slug])');
  expect(componentName('/app/src/routes/+layout.svelte')).toBe('+layout (/)');
  expect(componentName('/app/src/routes/(app)/+error.svelte')).toBe('+error ((app))');
  expect(componentName('/app/src/lib/Card.svelte')).toBe('Card');
  expect(componentName('C:\\app\\src\\routes\\about\\+page.svelte')).toBe('+page (about)');
});
