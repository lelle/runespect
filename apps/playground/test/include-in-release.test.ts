// @vitest-environment node
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { build, createLogger, type Rollup } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { runespectPreprocess, runespect } from '@runespect/vite-plugin';

// includeInRelease puts runespect in the code `vite build` produces. What that build does in a
// browser is in e2e/include-in-release.spec.ts; this is what it contains.

const appDir = path.resolve(import.meta.dirname, 'fixtures/release-app');

async function buildApp(
  includeInRelease?: boolean,
): Promise<{ bundle: string; warnings: string[] }> {
  const warnings: string[] = [];
  const customLogger = createLogger('silent');
  customLogger.warn = (message) => void warnings.push(message);
  const output = (await build({
    configFile: false,
    root: appDir,
    customLogger,
    plugins: [svelte({ preprocess: [runespectPreprocess()] }), runespect({ includeInRelease })],
    build: { write: false },
  })) as Rollup.RollupOutput;
  const bundle = output.output
    .map((file) => ('code' in file ? file.code : String(file.source)))
    .join('\n');
  return { bundle, warnings };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', undefined);
  vi.stubEnv('RUNESPECT_DEV_SERVER', undefined);
});
afterEach(() => vi.unstubAllEnvs());

test.each([undefined, false])(
  'includeInRelease: %s builds nothing of runespect',
  async (value) => {
    const { bundle, warnings } = await buildApp(value);

    expect(bundle).toContain('count');
    expect(/runespect/i.test(bundle)).toBe(false);
    expect(warnings.join()).not.toContain('includeInRelease');
  },
  60_000,
);

test('includeInRelease: true builds the agent and instruments components and modules', async () => {
  const { bundle } = await buildApp(true);

  expect(bundle).toContain('__runespect');
  expect(bundle).toMatch(/[`"']count[`"']/);
  expect(bundle).toContain('cart.svelte.js');
}, 60_000);

test('the build names files from the project root, not from the machine that built it', async () => {
  const { bundle } = await buildApp(true);

  expect(bundle).toContain('Counter.svelte');
  expect(bundle).not.toContain(appDir);
}, 60_000);

test('the build log says what the build exposes', async () => {
  const { warnings } = await buildApp(true);

  expect(warnings.filter((w) => w.includes('includeInRelease'))).toEqual([
    expect.stringContaining('Do not deploy it to production'),
  ]);
}, 60_000);

test('a build after it, in the same process, is clean again', async () => {
  await buildApp(true);
  const { bundle } = await buildApp(false);

  expect(/runespect/i.test(bundle)).toBe(false);
}, 60_000);
