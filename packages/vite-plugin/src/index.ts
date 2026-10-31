import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger, Plugin, ViteDevServer } from 'vite';
import {
  TO_PAGE_KINDS,
  TO_PANEL_KINDS,
  isRunespectMessage,
} from '@runespect/agent/protocol/internal';
import {
  PANEL_ROUTE,
  panelAssetPath,
  panelContentType,
  panelRedirect,
  releasePanelHtml,
} from './panel-route.ts';
import { AGENT_RUNTIME, DEV_SERVER_FLAG, RELEASE_ROOT_FLAG, agentCall } from './instrument.ts';
import { uiVersionProblem } from './ui-version.ts';
import { instrumentModule } from './module-state.ts';

// runespect() starts the agent in the page, brokers its messages to the panel window over Vite's
// HMR channel, serves that window, and instruments state in .svelte.ts modules. The agent goes in two
// ways, because transformIndexHtml does not cover every app: SvelteKit renders app.html itself and
// never runs the hook, so the agent is also appended to SvelteKit's generated client entry, the last
// module loaded before the app starts. runespectPreprocess() instruments the components.

export interface RunespectOptions {
  /**
   * Offer Open in editor in the panels. Default `true`; its links open VS Code, so turn it off when
   * your editor does not open `vscode://` links or the dev server runs on another machine.
   */
  openInEditor?: boolean;
  /**
   * Also build runespect into the code `vite build` produces, for a dev or test environment without
   * a dev server. Default `false`. Anyone who can open that build can read and edit its component
   * state, so never let it reach production.
   */
  includeInRelease?: boolean;
  /**
   * With `includeInRelease`, also put the panel window at `/__runespect/` in the build. Default
   * `true`; turn it off when the extension is all you use.
   */
  panelInRelease?: boolean;
}

// The dev servers in this process that runespect() serves. The flag runespectPreprocess() reads is
// set while there is at least one, so it never reaches a build run later in the same process.
const servers = new Set<Plugin>();
// Built by this package's own `build` script (panel/vite.config.ts) so the host app's Svelte setup —
// including runespect's own instrumentation — never compiles the devtools.
const panelDir = (): string => fileURLToPath(new URL('../panel-dist', import.meta.url));

function panelExists(logger?: Logger): boolean {
  if (existsSync(path.join(panelDir(), 'index.html'))) return true;
  logger?.warn(
    `[runespect] the panel window is missing from ${panelDir()}; build @runespect/vite-plugin.`,
  );
  return false;
}

const AGENT_ENTRIES = new Set([AGENT_RUNTIME, '@runespect/agent/internal', '@runespect/agent']);

/**
 * The dev-server half of runespect: broadcasts the instrumented tree to the browser extension and
 * serves the standalone panel window at `/__runespect/`. Applies to `vite dev` only, unless
 * `includeInRelease` says otherwise. Pair it with {@link runespectPreprocess}, which does the
 * instrumentation.
 */
export function runespect(options: RunespectOptions = {}): Plugin {
  const VIRTUAL = 'virtual:runespect-broadcast';
  // One event name for every runespect message on Vite's HMR channel. Must match the agent's
  // HOT_EVENT — the two ends are separate documents, so the dev server is the only thing they
  // share (see docs/explanation/architecture.md).
  const HOT_EVENT = 'runespect:msg';
  // Kit 2 writes the dev entry to generated/client/, Kit 3 to generated/dev/client/.
  const SVELTEKIT_ENTRIES = [
    '.svelte-kit/generated/client/app.js',
    '.svelte-kit/generated/dev/client/app.js',
  ];
  // And its build entry to generated/client-optimized/, and generated/build/client-optimized/.
  const SVELTEKIT_BUILD_ENTRIES = [
    '.svelte-kit/generated/client-optimized/app.js',
    '.svelte-kit/generated/build/client-optimized/app.js',
  ];
  const RESOLVED = '\0' + VIRTUAL;
  const withPanel = options.panelInRelease !== false;
  let releaseRoot: string | undefined;
  let logger: Logger | undefined;
  // SvelteKit builds several environments in turn, each between a buildStart and a closeBundle.
  let building = 0;
  const plugin: Plugin = {
    name: 'runespect',
    apply: (_, { command }) => command === 'serve' || options.includeInRelease === true,
    configResolved: {
      // Before SvelteKit's own configResolved, which warns about any plugin that has the hook.
      order: 'pre',
      handler(config) {
        if (config.command === 'build') {
          releaseRoot = config.root;
          logger = config.logger;
        }
        // A test runner also starts Vite in serve mode; tests opt in with runespectPreprocess({ enabled }).
        else if (!process.env.VITEST) {
          servers.add(plugin);
          process.env[DEV_SERVER_FLAG] = '1';
        }
        // Under SvelteKit the broadcast goes in through the client entry; the HTML hook never runs.
        if (config.plugins.some((p) => p.name === 'vite-plugin-sveltekit-setup')) {
          delete plugin.transformIndexHtml;
        }
        const problem = uiVersionProblem(config.root);
        if (problem) config.logger.warn(problem);
      },
    },
    buildStart() {
      if (!releaseRoot) return;
      building++;
      process.env[RELEASE_ROOT_FLAG] = releaseRoot;
      // Once: SvelteKit also builds a server environment, and resolves the config for each.
      if (this.environment.name === 'client') {
        logger?.warn(
          '[runespect] includeInRelease is on. This build exposes component state and lets ' +
            `anyone edit it${withPanel ? ', also at /__runespect/' : ''}. Do not deploy it to production.`,
        );
      }
    },
    // The panel window as plain files next to the app: nothing loads them until someone opens the
    // address, and they reach the page through the browser, with no server.
    generateBundle() {
      if (!releaseRoot || !withPanel || this.environment.name !== 'client') return;
      if (!panelExists(logger)) return;
      for (const file of readdirSync(panelDir(), { recursive: true, encoding: 'utf8' })) {
        const from = path.join(panelDir(), file);
        if (!statSync(from).isFile()) continue;
        const name = file.split(path.sep).join('/');
        this.emitFile({
          type: 'asset',
          fileName: `${PANEL_ROUTE.slice(1)}/${name}`,
          source:
            name === 'index.html'
              ? releasePanelHtml(readFileSync(from, 'utf8'))
              : readFileSync(from),
        });
      }
    },
    closeBundle() {
      if (releaseRoot && --building === 0) delete process.env[RELEASE_ROOT_FLAG];
      if (!servers.delete(plugin) || servers.size) return;
      delete process.env[DEV_SERVER_FLAG];
    },
    // Pre-bundling would bake a copy of the agent into the optimised @runespect/ui, where resolveId
    // below cannot reach it, and the overlay would read a second, empty agent.
    config() {
      return { optimizeDeps: { exclude: ['@runespect/agent', '@runespect/ui'] } };
    },
    // A virtual module (not an inline script) so Vite rewrites the bare `@runespect/agent`
    // import — inline injected scripts are not import-rewritten and fail in the browser.
    //
    // The agent is this plugin's dependency, not necessarily the app's, yet the injected code
    // imports it from the app's own files. It is resolved from here, so there is one agent and it
    // is always the version this plugin was released with: the runtime the injected code calls,
    // the internals the overlay reads, and the public entry all reach the same module. Before
    // Vite's own resolver, which would hand each importer the agent nearest it: a second one when
    // the app's @runespect/ui is another version and brought its own.
    resolveId: {
      order: 'pre',
      async handler(id: string, _importer?: string, options?: object) {
        if (id === VIRTUAL) return RESOLVED;
        if (!AGENT_ENTRIES.has(id)) return;
        return this.resolve(id, fileURLToPath(import.meta.url), { ...options, skipSelf: true });
      },
    },
    load(id: string) {
      if (id !== RESOLVED) return;
      // Two consumers, one agent: window.postMessage feeds the browser extension, and Vite's HMR
      // channel feeds the standalone panel window at /__runespect/; start() attaches both.
      const off = options.openInEditor === false || !!releaseRoot;
      const startOptions = [
        ...(!releaseRoot ? ['hot: import.meta.hot'] : []),
        ...(releaseRoot && withPanel ? [`hot: ${agentCall('pageChannel')}`] : []),
        ...(off ? ['openInEditor: false'] : []),
      ];
      return [
        `import * as __runespect from ${JSON.stringify(AGENT_RUNTIME)};`,
        `${agentCall('start', `{ ${startOptions.join(', ')} }`)};`,
        ``,
      ].join('\n');
    },
    transform(code: string, id: string) {
      // SvelteKit's generated entry — the app's own module graph, so no HTML hook is involved.
      if ((releaseRoot ? SVELTEKIT_BUILD_ENTRIES : SVELTEKIT_ENTRIES).some((e) => id.includes(e))) {
        return { code: `${code}\nimport ${JSON.stringify(VIRTUAL)};\n`, map: null };
      }
      // State in .svelte.ts modules. A normal plugin runs after Vite has stripped the types and
      // before vite-plugin-svelte compiles the module (it is `enforce: 'post'`).
      if (process.env[DEV_SERVER_FLAG] !== '1' && !releaseRoot) return;
      return instrumentModule(code, id, (source) => this.parse(source));
    },
    // Broker between the app page and the standalone panel window: neither can reach the other, but
    // both hold a Vite HMR connection. Every runespect message is rebroadcast to the channel with
    // its sender tag intact, so each end can drop its own echo.
    configureServer(server: ViteDevServer) {
      // Only a message of a kind the protocol has: anyone who can open the app can open the socket.
      const brokered = new Set<string>([...TO_PANEL_KINDS, ...TO_PAGE_KINDS]);
      server.ws.on(HOT_EVENT, (data: unknown) => {
        if (!isRunespectMessage(data) || !brokered.has(data.kind)) return;
        server.ws.send(HOT_EVENT, data);
      });

      // The panel window itself: prebuilt static files, served from the app's own dev server so it
      // shares the app's origin (and its TLS, which is what lets the HMR channel be wss).
      panelExists(server.config.logger);
      server.middlewares.use((req, res, next) => {
        const redirect = req.url ? panelRedirect(req.url, server.config.base) : null;
        if (redirect) {
          res.statusCode = 301;
          res.setHeader('location', redirect);
          return res.end();
        }
        const asset = req.url ? panelAssetPath(req.url, server.config.base) : null;
        if (!asset) return next();
        const file = path.resolve(panelDir(), asset);
        if (!file.startsWith(panelDir() + path.sep)) return next();
        readFile(file)
          .then((body) => {
            res.setHeader('content-type', panelContentType(file));
            res.end(body);
          })
          .catch(() => next());
      });
    },
    // Before Vite's own HTML transform, which then puts the app's `base` in front of the src.
    transformIndexHtml: {
      order: 'pre',
      // A build has no /@id/ URL, and bundles what an inline module imports.
      handler: () => [
        {
          tag: 'script',
          attrs: {
            type: 'module',
            ...(!releaseRoot && { src: `/@id/${RESOLVED.replace('\0', '__x00__')}` }),
          },
          ...(releaseRoot && { children: `import ${JSON.stringify(VIRTUAL)};` }),
          injectTo: 'body' as const,
        },
      ],
    },
  };
  return plugin;
}

export { runespectPreprocess, type RunespectPreprocessOptions } from './preprocess.ts';
