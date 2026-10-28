// @vitest-environment node
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { runespect } from '@runespect/vite-plugin';

// runespect() tells runespectPreprocess that a dev server is running through a process-wide flag.
// The flag must not outlive the server, or a build later in the same process is instrumented.

const appDir = path.resolve(import.meta.dirname, 'fixtures/production-app');
const flag = () => process.env.RUNESPECT_DEV_SERVER;

const serve = (): Promise<ViteDevServer> =>
  createServer({
    configFile: false,
    root: appDir,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
    plugins: [runespect()],
  });

beforeEach(() => {
  vi.stubEnv('RUNESPECT_DEV_SERVER', undefined);
  vi.stubEnv('VITEST', '');
});
afterEach(() => vi.unstubAllEnvs());

test('the flag is set while a dev server runs and gone once it closes', async () => {
  const server = await serve();
  expect(flag()).toBe('1');

  await server.close();
  expect(flag()).toBeUndefined();
});

test('the flag stays while another dev server still runs', async () => {
  const first = await serve();
  const second = await serve();

  await first.close();
  expect(flag()).toBe('1');

  await second.close();
  expect(flag()).toBeUndefined();
});
