// Installs the packed packages into a fresh Vite + Svelte app, outside this workspace, and checks
// that they work there: a production build carries no instrumentation, and the dev server reports
// the app's tree to one agent and shows the <Inspect> overlay. Then the same in a fresh SvelteKit
// app, where the plugin loads the agent through Kit's generated client entry instead of the HTML. Inside the workspace every package
// resolves to its source, so this is the only place a broken `exports`, `files` or dependency shows.
//
// Nothing is published: the tarballs come from `pnpm pack`, and the app's other dependencies come
// from the store this workspace already uses where they can.
//
// Run: pnpm test:pack
import { chromium, type Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';
import { checker, startServer, waitForUrl } from './lib.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['agent', 'ui', 'vite-plugin'];
const PORT = 5189;
const KIT_PORT = 5190;
// A space in the path, as under `/Users/John Doe/`: paths derived from URLs must survive it.
const work = mkdtempSync(join(tmpdir(), 'runespect pack-'));
const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
// `pnpm peers check` exits non-zero when it finds issues; what matters here is what it lists.
const peerIssues = (cwd: string): string => {
  try {
    return execFileSync('pnpm', ['peers', 'check'], { cwd, encoding: 'utf8' });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    return `${stdout ?? ''}${stderr ?? ''}`;
  }
};
const checks = checker();
const { check, fail } = checks;

// The app uses the same versions as the workspace, so an offline install finds them in the store,
// unless the version matrix asks for others (RUNESPECT_SVELTE, RUNESPECT_VITE, RUNESPECT_VPS,
// RUNESPECT_KIT).
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const kitPkg = JSON.parse(readFileSync(join(root, 'apps/sveltekit-spa/package.json'), 'utf8'));
const version = (name: string, env: string): string =>
  process.env[env] || rootPkg.devDependencies[name] || kitPkg.devDependencies[name];

// TypeScript in a module, so the plugin's transform must see it after Vite has stripped the types.
const CART_MODULE = `let total = $state<number>(3);
export const getTotal = (): number => total;
`;

// Every @runespect dependency between the packages resolves to its packed tarball, not the registry.
type Tarball = (p: string) => string;
const workspaceYaml = (tarball: Tarball) =>
  // The same seven-day cooldown on new releases as this workspace.
  // Vite 6 and 7 install esbuild, whose install script fetches its binary.
  'minimumReleaseAge: 10080\nallowBuilds:\n  esbuild: true\noverrides:\n' +
  PACKAGES.map((p) => `  '@runespect/${p}': '${tarball(p)}'\n`).join('');

async function serve(cwd: string, port: number): Promise<{ url: string; log: string[] }> {
  const { stop, log } = startServer(
    ['exec', 'vite', 'dev', '--port', String(port), '--strictPort'],
    { cwd, keepLog: true },
  );
  servers.push(stop);
  const url = `http://localhost:${port}/`;
  await waitForUrl(url);
  return { url, log };
}

// The panel window talks to the page over Vite's HMR channel, the part most tied to Vite.
async function panelShows(url: string, component: string, symbol = 'count'): Promise<string> {
  const panel = await browser!.newPage();
  await panel.goto(`${url}__runespect/?source=/`);
  const node = panel.locator(`[data-select="${component}"]`);
  await node
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  if ((await node.count()) === 0) return 'no tree';
  await node.first().click();
  const value = panel.locator(`[data-detail-edit="${component}.${symbol}"]`).first();
  await value.waitFor({ timeout: 5000 }).catch(() => {});
  return (await value.count()) ? `${symbol} ${await value.inputValue()}` : 'no values';
}

async function checkModuleShown(url: string, label: string): Promise<void> {
  const shown = await panelShows(url, 'cart.svelte.ts', 'total');
  check(shown === 'total 3', `${label}the panel window shows state in a .svelte.ts module`, shown);
}

// SvelteKit renders app.html itself and never runs transformIndexHtml; the plugin appends the agent
// to Kit's generated client entry, whose path is Kit's to change.
async function kitApp(tarball: Tarball): Promise<void> {
  const app = join(work, 'kit');
  const kit = version('@sveltejs/kit', 'RUNESPECT_KIT');
  mkdirSync(join(app, 'src/routes'), { recursive: true });
  writeFileSync(join(app, 'src/cart.svelte.ts'), CART_MODULE);
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify(
      {
        name: 'fresh-kit-app',
        private: true,
        type: 'module',
        devDependencies: {
          '@runespect/vite-plugin': tarball('vite-plugin'),
          '@sveltejs/kit': kit,
          '@sveltejs/vite-plugin-svelte': version('@sveltejs/vite-plugin-svelte', 'RUNESPECT_VPS'),
          svelte: version('svelte', 'RUNESPECT_SVELTE'),
          vite: version('vite', 'RUNESPECT_VITE'),
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(app, 'pnpm-workspace.yaml'), workspaceYaml(tarball));
  // Kit 3 takes its options in vite.config; Kit 2 reads svelte.config.js.
  const preprocess = 'preprocess: [vitePreprocess(), runespectPreprocess()]';
  const kit3 = Number(kit.replace(/^\D*/, '').split('.')[0]) >= 3;
  writeFileSync(
    join(app, 'vite.config.js'),
    `import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespect, runespectPreprocess } from '@runespect/vite-plugin';

export default defineConfig({
  plugins: [sveltekit(${kit3 ? `{ ${preprocess} }` : ''}), runespect()],
});
`,
  );
  if (!kit3) {
    writeFileSync(
      join(app, 'svelte.config.js'),
      `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespectPreprocess } from '@runespect/vite-plugin';

export default { ${preprocess} };
`,
    );
  }
  writeFileSync(
    join(app, 'src/app.html'),
    `<!doctype html><html><head>%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>`,
  );
  writeFileSync(
    join(app, 'src/routes/+page.svelte'),
    `<script>
  import { getTotal } from '../cart.svelte';
  let count = $state(1);
</script>
<button onclick={() => count++}>{count} of {getTotal()}</button>
`,
  );

  run('pnpm', ['install', '--prefer-offline'], app);
  const { url, log } = await serve(app, KIT_PORT);
  // The module runs on the server too while Kit renders the page: the injected code must not break it.
  const ssr = await fetch(url);
  const html = await ssr.text();
  check(
    ssr.ok && html.includes('1 of 3'),
    `Kit ${kit}: the page renders on the server with an instrumented module`,
    `${ssr.status}\n${log.join('').slice(-2000)}`,
  );
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  // Kit's first dev load can take longer than a fixed wait on a slow runner; wait for the agent.
  await page
    .waitForFunction(() => (window.__runespect?.events.length ?? 0) > 0, null, { timeout: 15000 })
    .catch(() => {});
  const events = await page.evaluate(() => window.__runespect?.events?.length ?? -1);
  check(events > 0, `Kit ${kit}: the agent loads through the client entry`, `events: ${events}`);
  await checkModuleShown(url, `Kit ${kit}: `);
  const shown = await panelShows(url, '+page (/)');
  check(shown === 'count 1', `Kit ${kit}: the panel window shows the tree with its values`, shown);
  check(errors.length === 0, `Kit ${kit}: the page hydrates without errors`, errors.join(' | '));
}

const servers: (() => Promise<void>)[] = [];
let browser: Browser | undefined;
try {
  const tarballs = join(work, 'tarballs');
  mkdirSync(tarballs);
  for (const p of PACKAGES) {
    run('pnpm', ['pack', '--pack-destination', tarballs], join(root, 'packages', p));
  }
  const tarball: Tarball = (p) =>
    'file:' +
    join(
      tarballs,
      readdirSync(tarballs).find((f) => f.startsWith(`runespect-${p}-`))!,
    );

  // An app compiles the shipped components with its own Svelte; Svelte 5.40-5.50 cannot strip some
  // TypeScript from a script, so the scripts ship as plain JavaScript.
  const ui = join(work, 'ui');
  mkdirSync(ui);
  run('tar', ['-xzf', tarball('ui').slice('file:'.length), '-C', ui], root);
  const dist = join(ui, 'package/dist');
  const typed = readdirSync(dist)
    .filter((f) => f.endsWith('.svelte'))
    .filter((f) => {
      const source = readFileSync(join(dist, f), 'utf8');
      const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
      try {
        for (const [, code] of scripts) parse(`<script>${code}</script>`);
        return false;
      } catch {
        return true;
      }
    });
  check(
    typed.length === 0,
    'the shipped components have plain JavaScript scripts',
    typed.join(', '),
  );

  const app = join(work, 'app');
  mkdirSync(join(app, 'src'), { recursive: true });
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify(
      {
        name: 'fresh-app',
        private: true,
        type: 'module',
        devDependencies: {
          '@runespect/vite-plugin': tarball('vite-plugin'),
          '@runespect/ui': tarball('ui'),
          '@sveltejs/vite-plugin-svelte': version('@sveltejs/vite-plugin-svelte', 'RUNESPECT_VPS'),
          svelte: version('svelte', 'RUNESPECT_SVELTE'),
          vite: version('vite', 'RUNESPECT_VITE'),
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(app, 'pnpm-workspace.yaml'), workspaceYaml(tarball));
  writeFileSync(
    join(app, 'vite.config.js'),
    `import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespect, runespectPreprocess } from '@runespect/vite-plugin';

export default defineConfig({
  plugins: [svelte({ preprocess: [vitePreprocess(), runespectPreprocess()] }), runespect()],
});
`,
  );
  writeFileSync(
    join(app, 'index.html'),
    `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>`,
  );
  writeFileSync(
    join(app, 'src/main.js'),
    `import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app') });
if (import.meta.env.DEV) {
  import('@runespect/ui').then(({ Inspect }) => mount(Inspect, { target: document.body }));
}
`,
  );
  writeFileSync(
    join(app, 'src/App.svelte'),
    `<script>
  import { getTotal } from './cart.svelte';
  let count = $state(1);
</script>
<button onclick={() => count++}>{count} {getTotal()}</button>
`,
  );
  writeFileSync(join(app, 'src/cart.svelte.ts'), CART_MODULE);

  run('pnpm', ['install', '--prefer-offline'], app);
  check(
    !peerIssues(app).includes('@runespect/'),
    'the runespect packages accept these Svelte and Vite versions',
    peerIssues(app),
  );

  run('pnpm', ['exec', 'vite', 'build'], app);
  const assets = join(app, 'dist/assets');
  const built = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
  // What the plugin writes is a descriptor per file; its keys and strings survive minification.
  check(
    !/symbols:\s*\{/.test(built) && !/kind:\s*["'](state|derived)["']/.test(built),
    'a production build carries no instrumentation',
  );
  check(
    !built.includes('__runespect'),
    'a production build carries neither the agent nor the overlay',
  );

  const { url } = await serve(app, PORT);

  browser = await chromium.launch();
  const page = await browser.newPage();
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  page.on('pageerror', (e) => warnings.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(2000);

  const events = await page.evaluate(() => window.__runespect?.events?.length ?? -1);
  check(events > 0, 'the agent publishes window.__runespect', `events: ${events}`);
  const overlay = page.locator('[data-component="App"]');
  check((await overlay.count()) > 0, 'the <Inspect> overlay shows the app');
  const count = page.locator('[data-edit="App.count"]');
  check((await count.count()) === 1 && (await count.inputValue()) === '1', 'it shows App.count');
  check(
    !warnings.some((w) => /runespect/i.test(w)),
    'the page loads with one agent and no runespect warnings',
    warnings.join(' | '),
  );

  const shown = await panelShows(url, 'App');
  check(shown === 'count 1', 'the panel window shows the app tree with its values', shown);
  await checkModuleShown(url, '');

  await kitApp(tarball);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  await Promise.all(servers.map((stop) => stop()));
  rmSync(work, { recursive: true, force: true });
}

console.log(checks.failures ? '\npack install failed' : '\npack install passed');
process.exit(checks.failures ? 1 : 0);
