import { test, expect } from 'vitest';
import { instrumentedModule } from './helpers/instrumented';

// A module given as source, through the same transform the dev server runs, read back from the agent.

test('a module that only holds a class from svelte/reactivity is reported, read-only', async () => {
  const m = await instrumentedModule(
    "import { SvelteSet } from 'svelte/reactivity';\nexport const tags = new SvelteSet(['a']);",
    { filename: 'tags.svelte.ts' },
  );

  expect(m.node.name).toBe('tags.svelte.ts');
  expect(m.kinds).toEqual({ tags: 'state' });
  expect(m.readable).toEqual(['tags']);
  expect(m.writable).toEqual([]);
});

test('a private `let` in a module can be edited, and the module sees it', async () => {
  const m = await instrumentedModule(
    'let count = $state(1);\nexport const getCount = (): number => count;',
  );

  expect(m.set('count', 4)).toBe(true);
  expect((m.exports.getCount as () => number)()).toBe(4);
});
