// @vitest-environment node
import { test, expect } from 'vitest';
import path from 'node:path';
import { build, type Rollup } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { runespectPreprocess, runespect } from '@runespect/vite-plugin';

const appDir = path.resolve(import.meta.dirname, 'fixtures/production-app');

async function buildApp(): Promise<string> {
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    const output = (await build({
      configFile: false,
      root: appDir,
      logLevel: 'silent',
      plugins: [svelte({ preprocess: [runespectPreprocess()] }), runespect()],
      build: { write: false, rollupOptions: { input: path.join(appDir, 'main.js') } },
    })) as Rollup.RollupOutput;
    return output.output.map((file) => ('code' in file ? file.code : '')).join('\n');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
}

test('a production build ships no instrumentation and no source paths', async () => {
  const bundle = await buildApp();

  expect(bundle.includes('<button>')).toBe(true);
  expect(bundle.includes(appDir)).toBe(false);
  expect(/runespect/i.test(bundle)).toBe(false);
}, 60_000);
