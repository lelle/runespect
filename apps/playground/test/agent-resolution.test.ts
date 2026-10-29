// @vitest-environment node
import { test, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Plugin } from 'vite';
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
  const resolveId = (plugin.resolveId as { handler: unknown }).handler as (
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

// In an app, Vite's own resolver finds whatever agent is nearest the importing file, before any
// plugin without an order is asked. With @runespect/ui on another version than the plugin, pnpm
// installs a second agent next to it, and the page would load both.
test("an agent the app could resolve on its own still loses to the plugin's", async () => {
  const app = mkdtempSync(path.join(tmpdir(), 'runespect-agent-'));
  const other = path.join(app, 'node_modules/@runespect/agent');
  mkdirSync(other, { recursive: true });
  writeFileSync(
    path.join(other, 'package.json'),
    JSON.stringify({
      name: '@runespect/agent',
      version: '0.0.1',
      type: 'module',
      exports: { './internal': './other.js', './runtime': './other.js' },
    }),
  );
  writeFileSync(path.join(other, 'other.js'), 'export {};\n');
  const server = await createServer({
    configFile: false,
    root: app,
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [runespect()],
  });
  try {
    const importer = path.join(app, 'src/main.ts');
    for (const id of ['@runespect/agent/internal', '@runespect/agent/runtime']) {
      const resolved = await server.pluginContainer.resolveId(id, importer);
      expect(resolved?.id).toMatch(/packages[/\\]agent[/\\]src[/\\]/);
    }
  } finally {
    await server.close();
  }
});
