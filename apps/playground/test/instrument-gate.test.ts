import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig } from 'vite';
import path from 'node:path';
import { runespectPreprocess, runespect } from '@runespect/vite-plugin';
import { tmpdir } from 'node:os';

// The playground's own directory, wherever the test runner was started from.
const PLAYGROUND = path.join(import.meta.dirname, '..');

const component = `<script>\n  let c = $state(0);\n</script>`;
const instruments = (options?: Parameters<typeof runespectPreprocess>[0]) =>
  runespectPreprocess(options).markup({ content: component, filename: 'C.svelte' }) !== undefined;

function startDevServer(): void {
  const hook = runespect().configResolved as { handler: (config: ResolvedConfig) => void };
  hook.handler({
    command: 'serve',
    plugins: [],
    root: tmpdir(),
    logger: { warn: () => {} },
  } as unknown as ResolvedConfig);
}

beforeEach(() => {
  vi.stubEnv('RUNESPECT_DEV_SERVER', '');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'development');
});
afterEach(() => vi.unstubAllEnvs());

test('nothing is instrumented unless runespect() serves the app', () => {
  expect(instruments()).toBe(false);
});

test('components are instrumented while runespect() serves the app', () => {
  startDevServer();
  expect(instruments()).toBe(true);
});

test('a Vitest run stays uninstrumented even when the config includes runespect()', () => {
  vi.stubEnv('VITEST', 'true');
  startDevServer();
  expect(instruments()).toBe(false);
});

test('enabled: true instruments without the dev server, e.g. in tests', () => {
  expect(instruments({ enabled: true })).toBe(true);
});

test('enabled: false wins over the dev server', () => {
  startDevServer();
  expect(instruments({ enabled: false })).toBe(false);
});

test('a production build is never instrumented, even with enabled: true', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(instruments({ enabled: true })).toBe(false);
});

// RegExp.test() on a /g or /y regex starts where the last match ended, so every other file would be
// skipped.
test('an include regex with the global flag instruments every matching file', () => {
  const pp = runespectPreprocess({ enabled: true, include: /\.svelte$/g });
  const run = (filename: string) => pp.markup({ content: component, filename }) !== undefined;
  expect([run('A.svelte'), run('B.svelte'), run('C.svelte')]).toEqual([true, true, true]);
});

// Linked or in a workspace, runespect's own components (the panel, the overlay) sit outside
// node_modules; instrumenting them would put the devtools in the app's tree.
test('runespect’s own components are never instrumented, wherever they are installed', () => {
  const own = path.resolve(PLAYGROUND, '../../packages/ui/src/Tree.svelte');
  const app = path.resolve(PLAYGROUND, 'src/Counter.svelte');
  const markup = (filename: string) =>
    runespectPreprocess({ enabled: true }).markup({ content: component, filename });
  expect(markup(own)).toBeUndefined();
  expect(markup(app)).not.toBeUndefined();
});

test('enabled: true alone does not instrument a production build', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(instruments({ enabled: true })).toBe(false);
});
