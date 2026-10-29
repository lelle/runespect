// @vitest-environment node
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { runespect } from '@runespect/vite-plugin';
import {
  panelAssetPath,
  panelContentType,
  panelRedirect,
  viteClientUrl,
} from '@runespect/vite-plugin/internal';
import { TO_PAGE_KINDS, TO_PANEL_KINDS } from '@runespect/agent/protocol/internal';
import { HOT_EVENT } from '@runespect/agent/internal';
import { parseAst } from 'vite';

// Stand-in for Vite's dev server: the ws channel plus the middleware stack the plugin uses.
function fakeServer() {
  const handlers = new Map<string, ((data: unknown, client: unknown) => void)[]>();
  return {
    broadcast: [] as { event: string; data: unknown }[],
    ws: {
      on(event: string, cb: (data: unknown, client: unknown) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), cb]);
      },
      send(event: string, data: unknown) {
        (this as any)._server.broadcast.push({ event, data });
      },
    },
    middlewares: { use: () => {} },
    config: { base: '/', logger: { warn: () => {} } },
    _emit(data: unknown) {
      (handlers.get(HOT_EVENT) ?? []).forEach((cb) => cb(data, {}));
    },
  };
}

function withServer() {
  const server = fakeServer();
  (server.ws as any)._server = server;
  (runespect() as any).configureServer(server);
  return server;
}

// The two ends never talk directly: the app page and the panel window are separate documents, and
// the dev server is the only thing both are connected to.
test('a message from one client is rebroadcast to the channel', () => {
  const server = withServer();

  server._emit({ source: 'runespect', kind: 'tree', nodes: [], __rsFrom: 'app' });

  expect(server.broadcast).toHaveLength(1);
  expect(server.broadcast[0].event).toBe(HOT_EVENT);
  expect(server.broadcast[0].data).toMatchObject({ kind: 'tree', __rsFrom: 'app' });
});

// The sender tag has to survive the trip, or neither end can tell its own echo apart.
test('the sender tag is preserved through the broker', () => {
  const server = withServer();

  server._emit({ source: 'runespect', kind: 'request', __rsFrom: 'panel-window' });

  expect((server.broadcast[0].data as { __rsFrom: string }).__rsFrom).toBe('panel-window');
});

test('the broker forwards only runespect messages', () => {
  const server = withServer();

  server._emit({ kind: 'something-else' });

  expect(server.broadcast).toHaveLength(0);
});

// Anyone who can open the app can open the HMR socket; what it forwards is at least a message the
// protocol knows.
test('the broker forwards only the kinds of message the protocol has', () => {
  const server = withServer();

  server._emit({ source: 'runespect', kind: 'exec', code: 'alert(1)' });
  server._emit({ source: 'runespect', kind: 'edit', id: 1, symbol: 'n', value: 2, path: [] });

  expect(server.broadcast.map((b) => (b.data as { kind: string }).kind)).toEqual(['edit']);
});

// The injected module is what makes the app reachable from the panel window: without connecting a
// hot transport, the app only ever broadcasts to window.postMessage (the extension's path).
test('the injected module hands the page its hot channel', async () => {
  const plugin = runespect() as any;
  const code = plugin.load(await plugin.resolveId.handler('virtual:runespect-broadcast'));

  expect(code).toContain('start({ hot: import.meta.hot })');
});

// Path mapping for the served panel: an unknown path must fall back to index.html (the panel is a
// single page), and nothing may escape panel-dist.
test('panelAssetPath maps the served URLs, and refuses to leave the bundle', () => {
  expect(panelAssetPath('/__runespect/')).toBe('index.html');
  expect(panelAssetPath('/__runespect')).toBe('index.html');
  expect(panelAssetPath('/__runespect/assets/index-abc.js')).toBe('assets/index-abc.js');
  expect(panelAssetPath('/__runespect/assets/x.js?v=1')).toBe('assets/x.js');
  expect(panelAssetPath('/somewhere-else')).toBeNull();
  expect(panelAssetPath('/__runespect/../../../etc/passwd')).toBeNull();
});

// The panel is sent with readFile, so its type has to be named; a browser may refuse a script or
// an icon labelled application/octet-stream.
test('panelContentType names the type of each kind of file the panel ships', () => {
  expect(panelContentType('index.html')).toBe('text/html; charset=utf-8');
  expect(panelContentType('assets/index-abc.js')).toBe('text/javascript; charset=utf-8');
  expect(panelContentType('assets/icon-32-abc.png')).toBe('image/png');
  expect(panelContentType('assets/unknown.xyz')).toBe('application/octet-stream');
});

// Under Vite's `base`, the app, its dev client and the panel all move: `/app/__runespect/`.
test('under a base path, the panel is served below it and nowhere else', () => {
  expect(panelAssetPath('/app/__runespect/', '/app/')).toBe('index.html');
  expect(panelAssetPath('/app/__runespect/assets/x.js', '/app/')).toBe('assets/x.js');
  expect(panelAssetPath('/__runespect/', '/app/')).toBeNull();
});

test('the panel finds the dev client below the base it was served under', () => {
  expect(viteClientUrl('/__runespect/')).toBe('/@vite/client');
  expect(viteClientUrl('/app/__runespect/')).toBe('/app/@vite/client');
  expect(viteClientUrl('/a/b/__runespect')).toBe('/a/b/@vite/client');
});

// The bundle loads its assets relative to the page, so `/__runespect` without the slash would load
// the page and then fetch /assets/… from the app.
test('the panel route without its trailing slash redirects to it, keeping the query', () => {
  expect(panelRedirect('/__runespect')).toBe('/__runespect/');
  expect(panelRedirect('/__runespect?source=/a')).toBe('/__runespect/?source=/a');
  expect(panelRedirect('/app/__runespect', '/app/')).toBe('/app/__runespect/');
  expect(panelRedirect('/__runespect/')).toBeNull();
  expect(panelRedirect('/elsewhere')).toBeNull();
});

test('a path inside the panel that is not a file gets the panel page', () => {
  expect(panelAssetPath('/__runespect/some/view')).toBe('index.html');
  expect(panelAssetPath('/__runespect/assets/missing.js')).toBe('assets/missing.js');
});

test('a backslash cannot climb out of the bundle either', () => {
  expect(panelAssetPath('/__runespect/..\\..\\secret.js')).toBeNull();
});

// A Vite config is loaded by plain Node, before any bundler runs, so whatever the plugin imports must
// load there from source as well as from the published build.
test('plain Node loads the protocol from source, as a Vite config would', () => {
  const kinds = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "const p = await import('@runespect/agent/protocol/internal'); console.log([...p.TO_PANEL_KINDS, ...p.TO_PAGE_KINDS].join(','));",
    ],
    // From the playground, which depends on the protocol, wherever the test runner was started.
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(import.meta.dirname, '..'),
    },
  ).trim();
  expect(kinds.split(',')).toEqual([...TO_PANEL_KINDS, ...TO_PAGE_KINDS]);
});

test('the broker forwards every kind of message the protocol has', () => {
  const server = withServer();
  const kinds = [...TO_PANEL_KINDS, ...TO_PAGE_KINDS];

  for (const kind of kinds) server._emit({ source: 'runespect', kind });

  expect(server.broadcast.map((b) => (b.data as { kind: string }).kind)).toEqual(kinds);
});

// The panel window is served by a middleware on the app's own dev server.
function panelMiddleware() {
  let middleware!: (req: { url?: string }, res: any, next: () => void) => void;
  const server = fakeServer();
  server.middlewares.use = ((fn: typeof middleware) => (middleware = fn)) as never;
  (runespect() as any).configureServer(server);
  return async (url: string) => {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as unknown,
      ended: false,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end(body?: unknown) {
        this.body = body;
        this.ended = true;
      },
    };
    let passed = false;
    middleware({ url }, res, () => (passed = true));
    await new Promise((r) => setTimeout(r, 20)); // a file is read asynchronously
    return { res, passed };
  };
}

test('the panel route without its slash is redirected, and other routes are left to the app', async () => {
  const request = panelMiddleware();
  const redirected = await request('/__runespect?tab=history');
  expect([redirected.res.statusCode, redirected.res.headers.location]).toEqual([
    301,
    '/__runespect/?tab=history',
  ]);
  expect((await request('/src/App.svelte')).passed).toBe(true);
});

test('a file the panel does not have is left to the app', async () => {
  const { res, passed } = await panelMiddleware()('/__runespect/missing.js');
  expect([res.ended, passed]).toEqual([false, true]);
});

// Anyone who can open the app can ask its dev server for a path; a doubled slash makes it absolute.
test('a path that names a file outside the panel is not served', async () => {
  const outside = path.join(import.meta.dirname, '..', 'package.json');
  const { res, passed } = await panelMiddleware()(`/__runespect/${outside}`);
  expect([res.ended, passed]).toEqual([false, true]);
});

// Outside a dev server (a build, a test runner), a .svelte.ts module is left as it was written.
test('a module is instrumented only while the dev server runs', () => {
  const plugin = runespect() as any;
  const context = { parse: parseAst };
  const code = 'export let n = $state(0);\n';
  const flag = process.env.RUNESPECT_DEV_SERVER;
  try {
    delete process.env.RUNESPECT_DEV_SERVER;
    expect(plugin.transform.call(context, code, '/app/src/n.svelte.ts')).toBeUndefined();
    process.env.RUNESPECT_DEV_SERVER = '1';
    expect(plugin.transform.call(context, code, '/app/src/n.svelte.ts')?.code).toContain(
      '__runespect.module(',
    );
  } finally {
    if (flag === undefined) delete process.env.RUNESPECT_DEV_SERVER;
    else process.env.RUNESPECT_DEV_SERVER = flag;
  }
});
