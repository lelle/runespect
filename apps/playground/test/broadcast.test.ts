import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { runespect } from '@runespect/vite-plugin';
import App from '../src/App.svelte';
import { openPanel } from './helpers/agent';
import { requestMessage } from '@runespect/agent/protocol/internal';
import { tmpdir } from 'node:os';

let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

test('broadcast() posts tree snapshots to the window once a panel asks', async () => {
  const got: any[] = [];
  const handler = (e: any) => {
    if (e.data && e.data.source === 'runespect') got.push(e.data);
  };
  window.addEventListener('message', handler);

  stop = agent.broadcast();

  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(App, { target });
  flushSync();
  await new Promise((r) => setTimeout(r, 0)); // window 'message' is async
  // What the extension's panel sends once it has heard the page's hello.
  const page = got.find((m) => m.kind === 'hello').from;
  window.postMessage({ ...requestMessage(), to: page }, '*');
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  const tree = got.find((m) => m.kind === 'tree');
  expect(tree).toBeTruthy();
  expect(tree.nodes.map((n: any) => n.name)).toEqual(expect.arrayContaining(['App', 'Counter']));

  window.removeEventListener('message', handler);
});

test('broadcast() is a no-op on the server (no window)', () => {
  vi.stubGlobal('window', undefined);
  const disconnect = agent.broadcast();
  expect(typeof disconnect).toBe('function'); // safe no-op
});

test('runespect() vite plugin serves a dev-only broadcast virtual module', async () => {
  const plugin: any = runespect(); // hooks are ObjectHook unions; call them directly in the test
  expect(plugin.name).toBe('runespect');
  expect(plugin.apply).toBe('serve'); // dev only

  // injects a <script src> pointing at the virtual module (not an inline import,
  // which Vite would not rewrite)
  const tags = plugin.transformIndexHtml.handler();
  expect(tags).toHaveLength(1);
  expect(tags[0].tag).toBe('script');
  expect(tags[0].attrs.type).toBe('module');
  expect(tags[0].attrs.src).toContain('runespect-broadcast');

  // the virtual module resolves + loads to the broadcast call
  const resolved = await plugin.resolveId.handler('virtual:runespect-broadcast');
  expect(resolved).toBeTruthy();
  const code = plugin.load(resolved);
  expect(code).toContain('from "@runespect/agent/runtime"');
  expect(code).toContain('__runespect.start({ hot: import.meta.hot })');
});

test('runespect({ openInEditor: false }) starts the page with Open in editor off', async () => {
  const load = async (plugin: any) =>
    plugin.load(await plugin.resolveId.handler('virtual:runespect-broadcast'));
  expect(await load(runespect({ openInEditor: false }))).toContain('openInEditor: false');
  expect(await load(runespect())).not.toContain('openInEditor');
});

// What every resolved config has; the app root has no @runespect/ui to compare.
const viteConfig = { root: tmpdir(), logger: { warn: () => {} } };

// SvelteKit 3 warns about any plugin that has a transformIndexHtml hook, from its own
// configResolved. Under Kit the hook is dead weight (the broadcast goes in through the client
// entry), so the plugin drops it — and must do so before Kit looks.
test('under SvelteKit, runespect() drops its transformIndexHtml before SvelteKit checks for it', () => {
  const plugin: any = runespect();
  expect(plugin.configResolved.order).toBe('pre');

  plugin.configResolved.handler({
    ...viteConfig,
    plugins: [{ name: 'vite-plugin-sveltekit-setup' }, plugin],
  });
  expect(plugin.transformIndexHtml).toBeUndefined();
});

test('without SvelteKit, runespect() keeps its transformIndexHtml', () => {
  const plugin: any = runespect();
  plugin.configResolved.handler({ ...viteConfig, plugins: [{ name: 'vite:svelte' }, plugin] });
  expect(plugin.transformIndexHtml.handler).toBeTypeOf('function');
});

// SvelteKit renders app.html itself, so transformIndexHtml never runs and the broadcast script is
// never injected — the symptom is a panel stuck on Tier 1 (names, no state). The plugin therefore
// also hangs the broadcast off the module graph, at SvelteKit's generated client entry.
test('runespect() also injects the broadcast into SvelteKit’s generated client entry', () => {
  const plugin: any = runespect();
  const id = '/app/.svelte-kit/generated/client/app.js';

  const out = plugin.transform('export const x = 1', id);
  expect(out).toBeTruthy();
  expect(out.code).toContain('export const x = 1'); // the entry is kept, not replaced
  expect(out.code).toContain('virtual:runespect-broadcast');
});

// SvelteKit 3's dev entry lives under generated/dev/ and skips transformIndexHtml, so the plugin
// matches that path too, or nothing would connect on a Kit 3 app.
test('runespect() injects the broadcast into SvelteKit 3’s dev client entry', () => {
  const plugin: any = runespect();
  const id = '/app/.svelte-kit/generated/dev/client/app.js';

  const out = plugin.transform('export const x = 1', id);
  expect(out).toBeTruthy();
  expect(out.code).toContain('export const x = 1');
  expect(out.code).toContain('virtual:runespect-broadcast');
});

test('runespect() leaves every other module untouched', () => {
  const plugin: any = runespect();
  expect(plugin.transform('export const x = 1', '/src/routes/+page.svelte')).toBeUndefined();
  expect(plugin.transform('export const x = 1', '/src/lib/app.js')).toBeUndefined();
  expect(
    plugin.transform('export const x = 1', '/app/.svelte-kit/generated/dev/client/nodes/0.js'),
  ).toBeUndefined();
});

// The wire is structuredClone: a value it refuses aborts the whole postMessage, so without this
// guard one un-cloneable field would mean no tree at all — plus an uncaught DataCloneError in the
// inspected app's own console, which is not ours to throw.
test('connect: a rejected send is reported once, and the agent keeps running', () => {
  const refused: unknown[] = [];
  const transport = {
    send: (m: unknown) => {
      refused.push(m);
      throw new DOMException('could not be cloned', 'DataCloneError');
    },
    onMessage: () => () => {},
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const target = document.createElement('div');
  document.body.appendChild(target);
  expect(() => {
    stop = agent.connect(openPanel(transport));
    mount(App, { target });
    flushSync();
  }).not.toThrow();

  expect(refused.length).toBeGreaterThan(0); // it really tried
  expect(warn).toHaveBeenCalled(); // and said so, instead of failing silently
  warn.mockRestore();
});
