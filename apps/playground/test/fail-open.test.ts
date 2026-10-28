// @vitest-environment node
import { test, expect, vi, afterEach } from 'vitest';
import { compile, preprocess, type PreprocessorGroup } from 'svelte/compiler';
import { runespectPreprocess } from '@runespect/vite-plugin';
import { instrumentModule } from '@runespect/vite-plugin/internal';

// runespect must never break an app it cannot instrument: a file it cannot read is compiled as if
// runespect were not there, and the developer is told once.

// CONSTRUCTED: stands in for svelte-preprocess's CoffeeScript support, which turns the script into
// JavaScript only when its own turn comes.
const coffee: PreprocessorGroup = {
  name: 'coffee',
  script: ({ content, attributes }) =>
    attributes.lang === 'coffee'
      ? { code: content.replace(/^(\s*)(\w+) = -> (.*)$/gm, '$1let $2 = () => $3') }
      : undefined,
};
const component = `<script lang="coffee">\n  greet = -> 'hi'\n</script>\n<button>{greet()}</button>`;

afterEach(() => vi.restoreAllMocks());

test('a component in another script language compiles when runespect runs before its preprocessor', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { code } = await preprocess(component, [runespectPreprocess({ enabled: true }), coffee], {
    filename: 'Counter.svelte',
  });
  expect(() => compile(code, { filename: 'Counter.svelte' })).not.toThrow();
});

test('a component runespect cannot read is warned about once, naming the file and the fix', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const pp = runespectPreprocess({ enabled: true });

  pp.markup({ content: component, filename: 'Once.svelte' });
  pp.markup({ content: component, filename: 'Once.svelte' });

  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('Once.svelte');
  expect(warn.mock.calls[0][0]).toMatch(/last/);
});

test('a module runespect cannot read is left as it is and warned about once', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const unreadable = () => {
    throw new SyntaxError('Unexpected token');
  };
  const code = 'export const count = $state(0);';

  expect(instrumentModule(code, '/app/src/once.svelte.ts', unreadable)).toBeNull();
  expect(instrumentModule(code, '/app/src/once.svelte.ts', unreadable)).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('once.svelte.ts');
});
