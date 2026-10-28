import { test, expect } from 'vitest';
import type { Plugin } from 'vite';
import { runespect } from '@runespect/vite-plugin';

// The agent is the plugin's dependency, not necessarily the app's, but the injected code imports it
// from the app's own files. The plugin resolves it from where it is installed itself, so there is
// one agent and it is always the version the plugin was released with.
test('the agent is resolved from the plugin, whoever imports it', async () => {
  const plugin = runespect() as Plugin;
  const asked: { id: string; importer?: string }[] = [];
  const context = {
    resolve: async (id: string, importer?: string) => {
      asked.push({ id, importer });
      return { id: `/resolved/${id}` };
    },
  };
  const resolveId = plugin.resolveId as (
    this: typeof context,
    id: string,
    importer?: string,
    options?: object,
  ) => Promise<unknown>;

  const result = await resolveId.call(
    context,
    '@runespect/agent/internal',
    '/app/src/App.svelte',
    {},
  );
  expect(result).toEqual({ id: '/resolved/@runespect/agent/internal' });
  expect(asked[0].importer).toMatch(/vite-plugin[/\\]src[/\\]index\.ts$/);
});

// Pre-bundling would bake a copy of the agent into the optimised @runespect/ui, past resolveId.
test('the agent and the overlay are kept out of dependency pre-bundling', () => {
  const plugin = runespect() as Plugin;
  const config = (plugin.config as () => { optimizeDeps: { exclude: string[] } })();
  expect(config.optimizeDeps.exclude).toEqual(
    expect.arrayContaining(['@runespect/agent', '@runespect/ui']),
  );
});
